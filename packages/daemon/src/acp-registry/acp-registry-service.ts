import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { setInstalledAcpRegistryAgents } from "@cocurdex/agent-core";
import {
  type AcpRegistryAgentId,
  type AcpRegistryCatalogAgent,
  type AcpRegistryInstalledAgent,
  isAcpRegistryAgentId,
} from "@cocurdex/shared";
import type { DaemonState } from "../state";
import {
  type AcpRegistryEntry,
  fetchAcpRegistry,
} from "./acp-registry-catalog";
import {
  getAcpRegistryAgentsRoot,
  installAcpRegistryAgent,
} from "./acp-registry-install";
import {
  findLocalCliAgent,
  LOCAL_CLI_REGISTRY_IDS,
} from "./acp-registry-local";

export const ACP_REGISTRY_AGENTS_SETTING_KEY = "acpRegistry.installedAgents";
export const ACP_REGISTRY_ADOPTED_LOCAL_SETTING_KEY =
  "acpRegistry.adoptedLocalClis";
const CATALOG_TTL_MS = 60 * 60 * 1000;

type SettingsStore = Pick<DaemonState, "getAppSetting" | "setAppSetting">;

function isInstalledAgent(value: unknown): value is AcpRegistryInstalledAgent {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const agent = value as Partial<AcpRegistryInstalledAgent>;
  return (
    typeof agent.agentId === "string" &&
    isAcpRegistryAgentId(agent.agentId) &&
    typeof agent.registryId === "string" &&
    typeof agent.name === "string" &&
    typeof agent.version === "string" &&
    typeof agent.command === "string" &&
    Array.isArray(agent.args) &&
    typeof agent.env === "object" &&
    agent.env !== null
  );
}

function parseStringList(raw: string | null | undefined): string[] {
  try {
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function parseInstalledAcpRegistryAgents(
  raw: string | null | undefined,
): AcpRegistryInstalledAgent[] {
  if (!raw) {
    return [];
  }
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter(isInstalledAgent) : [];
  } catch {
    return [];
  }
}

export class AcpRegistryService {
  readonly ready: Promise<void>;
  private installed: AcpRegistryInstalledAgent[] = [];
  private catalog: { entries: AcpRegistryEntry[]; fetchedAt: number } | null =
    null;
  private readonly installing = new Map<
    string,
    Promise<AcpRegistryInstalledAgent>
  >();

  constructor(
    private readonly settings: SettingsStore,
    private readonly userDataPath: string,
    private readonly fetchCatalog = fetchAcpRegistry,
    private readonly findLocal = findLocalCliAgent,
  ) {
    this.ready = this.load();
  }

  private async load() {
    const raw = await this.settings.getAppSetting(
      ACP_REGISTRY_AGENTS_SETTING_KEY,
    );
    this.apply(parseInstalledAcpRegistryAgents(raw));
    await this.adoptLocalClis();
  }

  private async adoptLocalClis() {
    const adopted = new Set(
      parseStringList(
        await this.settings.getAppSetting(
          ACP_REGISTRY_ADOPTED_LOCAL_SETTING_KEY,
        ),
      ),
    );
    const candidates = LOCAL_CLI_REGISTRY_IDS.filter(
      (registryId) =>
        !adopted.has(registryId) &&
        !this.installed.some((agent) => agent.registryId === registryId),
    );
    const found = (
      await Promise.all(
        candidates.map((registryId) => this.findLocal(registryId)),
      )
    ).filter((agent): agent is AcpRegistryInstalledAgent => agent !== null);
    if (found.length === 0) {
      return;
    }
    await this.persist([...this.installed, ...found]);
    await this.settings.setAppSetting(
      ACP_REGISTRY_ADOPTED_LOCAL_SETTING_KEY,
      JSON.stringify([...adopted, ...found.map((agent) => agent.registryId)]),
    );
  }

  private apply(agents: AcpRegistryInstalledAgent[]) {
    this.installed = agents;
    setInstalledAcpRegistryAgents(agents);
  }

  private async persist(agents: AcpRegistryInstalledAgent[]) {
    await this.settings.setAppSetting(
      ACP_REGISTRY_AGENTS_SETTING_KEY,
      JSON.stringify(agents),
    );
    this.apply(agents);
  }

  private async entries(forceRefresh: boolean) {
    const now = Date.now();
    if (
      !forceRefresh &&
      this.catalog &&
      now - this.catalog.fetchedAt < CATALOG_TTL_MS
    ) {
      return this.catalog.entries;
    }
    const entries = await this.fetchCatalog();
    this.catalog = { entries, fetchedAt: now };
    return entries;
  }

  async listCatalog(
    options: { forceRefresh?: boolean } = {},
  ): Promise<AcpRegistryCatalogAgent[]> {
    return (await this.entries(options.forceRefresh ?? false)).map(
      (entry) => entry.agent,
    );
  }

  listInstalled() {
    return this.installed.map((agent) => ({ ...agent }));
  }

  install(registryId: string): Promise<AcpRegistryInstalledAgent> {
    const pending = this.installing.get(registryId);
    if (pending) {
      return pending;
    }
    const install = (async () => {
      await this.ready;
      const agent =
        (await this.findLocal(registryId)) ??
        (await this.installFromCatalog(registryId));
      await this.persist([
        ...this.installed.filter((item) => item.registryId !== registryId),
        agent,
      ]);
      await this.removeStaleVersions(agent);
      return agent;
    })().finally(() => this.installing.delete(registryId));
    this.installing.set(registryId, install);
    return install;
  }

  private async installFromCatalog(registryId: string) {
    const entry = (await this.entries(false)).find(
      (candidate) => candidate.agent.registryId === registryId,
    );
    if (!entry) {
      throw new Error(`ACP Registry has no agent named ${registryId}`);
    }
    if (entry.agent.builtInAgentId) {
      throw new Error(
        `${entry.agent.name} is already built in as ${entry.agent.builtInAgentId}`,
      );
    }
    return installAcpRegistryAgent(entry, this.userDataPath);
  }

  async uninstall(agentId: AcpRegistryAgentId) {
    await this.ready;
    const agent = this.installed.find((item) => item.agentId === agentId);
    if (!agent) {
      return;
    }
    await this.persist(this.installed.filter((item) => item !== agent));
    await rm(this.agentDirectory(agent), { recursive: true, force: true });
  }

  private agentDirectory(agent: AcpRegistryInstalledAgent) {
    return path.join(
      getAcpRegistryAgentsRoot(this.userDataPath),
      agent.registryId,
    );
  }

  private async removeStaleVersions(agent: AcpRegistryInstalledAgent) {
    if (agent.distribution !== "binary") {
      await rm(this.agentDirectory(agent), { recursive: true, force: true });
      return;
    }
    const directory = this.agentDirectory(agent);
    const versions = await readdir(directory).catch(() => [] as string[]);
    await Promise.all(
      versions
        .filter((version) => version !== agent.version)
        .map((version) =>
          rm(path.join(directory, version), {
            recursive: true,
            force: true,
          }).catch(() => undefined),
        ),
    );
  }
}
