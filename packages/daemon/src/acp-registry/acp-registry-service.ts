import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import {
  lookupExecutable,
  setInstalledAcpRegistryAgents,
} from "@cocurdex/agent-core";
import {
  type AcpRegistryAgentId,
  type AcpRegistryAgentUpdate,
  type AcpRegistryCatalogAgent,
  type AcpRegistryInstalledAgent,
  type AcpRegistryInstallPlan,
  compareAgentVersions,
  isAcpRegistryAgentId,
  toAcpRegistryAgentId,
} from "@cocurdex/shared";
import type { DaemonState } from "../state";
import {
  type AcpRegistryEntry,
  fetchAcpRegistry,
} from "./acp-registry-catalog";
import {
  getAcpRegistryAgentsRoot,
  installAcpRegistryAgent,
  planAcpRegistryInstall,
  type RunPrefetch,
  runPrefetch,
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

function newestVersion(
  versions: ReadonlyArray<string | undefined>,
): string | undefined {
  let newest: string | undefined;
  for (const version of versions) {
    if (!version) {
      continue;
    }
    if (!newest || compareAgentVersions(version, newest) > 0) {
      newest = version;
    }
  }
  return newest;
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
    private readonly lookup = lookupExecutable,
    private readonly prefetch: RunPrefetch = runPrefetch,
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
    const next = [...this.installed];
    const newlyAdopted: string[] = [];
    for (const registryId of LOCAL_CLI_REGISTRY_IDS) {
      const index = next.findIndex((agent) => agent.registryId === registryId);
      const installed = index === -1 ? undefined : next[index];
      if (installed === undefined) {
        // A removal is explicit: do not adopt the same local CLI again.
        if (adopted.has(registryId)) {
          continue;
        }
        const local = await this.findLocal(registryId);
        if (local) {
          next.push(local);
          newlyAdopted.push(registryId);
        }
        continue;
      }
      if (installed.distribution !== "local") {
        // A managed runtime stays in place; listUpdates offers a newer local CLI.
        continue;
      }
      const local = await this.findLocal(registryId);
      if (
        local &&
        (local.command !== installed.command ||
          local.args.join("\0") !== installed.args.join("\0") ||
          local.version !== installed.version)
      ) {
        next[index] = { ...local, installedAt: installed.installedAt };
      }
    }
    if (JSON.stringify(next) !== JSON.stringify(this.installed)) {
      await this.persist(next);
    }
    if (newlyAdopted.length > 0) {
      await this.settings.setAppSetting(
        ACP_REGISTRY_ADOPTED_LOCAL_SETTING_KEY,
        JSON.stringify([...adopted, ...newlyAdopted]),
      );
    }
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
    const entries = await this.entries(options.forceRefresh ?? false);
    return Promise.all(
      entries.map(async (entry) => ({
        ...entry.agent,
        installPlan: await this.planInstall(entry),
      })),
    );
  }

  private async planInstall(
    entry: AcpRegistryEntry,
  ): Promise<AcpRegistryInstallPlan | null> {
    const local = LOCAL_CLI_REGISTRY_IDS.includes(entry.agent.registryId)
      ? await this.findLocal(entry.agent.registryId)
      : null;
    if (local) {
      const { command, args, env } = local;
      return { launch: { command, args, env }, download: null, prefetch: null };
    }
    try {
      return planAcpRegistryInstall(entry, this.userDataPath);
    } catch {
      return null;
    }
  }

  listInstalled() {
    return this.installed.map((agent) => ({ ...agent }));
  }

  install(registryId: string): Promise<AcpRegistryInstalledAgent> {
    return this.save(
      registryId,
      async () =>
        (await this.findLocal(registryId)) ??
        (await this.installFromCatalog(registryId)),
    );
  }

  installCommand(
    registryId: string,
    command: string,
    args: string[],
  ): Promise<AcpRegistryInstalledAgent> {
    return this.save(registryId, async () => {
      const { agent, launch } = await this.findInstallableEntry(registryId);
      const resolved = command.trim()
        ? await this.lookup(command.trim())
        : null;
      if (!resolved) {
        throw new Error(`Command not found: ${command}`);
      }
      return {
        agentId: toAcpRegistryAgentId(registryId),
        registryId,
        name: agent.name,
        version: "",
        description: agent.description,
        distribution: "local",
        command: resolved,
        args,
        env: launch?.target.env ?? {},
        installedAt: new Date().toISOString(),
      };
    });
  }

  private save(
    registryId: string,
    resolveAgent: () => Promise<AcpRegistryInstalledAgent>,
  ): Promise<AcpRegistryInstalledAgent> {
    const pending = this.installing.get(registryId);
    if (pending) {
      return pending;
    }
    const install = (async () => {
      await this.ready;
      const resolved = await resolveAgent();
      const authMethodId = this.installed.find(
        (item) => item.registryId === registryId,
      )?.authMethodId;
      const agent = authMethodId ? { ...resolved, authMethodId } : resolved;
      await this.persist([
        ...this.installed.filter((item) => item.registryId !== registryId),
        agent,
      ]);
      await this.removeStaleVersions(agent);
      if (agent.distribution === "local") {
        await this.recordLocalAdoption(registryId);
      }
      return agent;
    })().finally(() => this.installing.delete(registryId));
    this.installing.set(registryId, install);
    return install;
  }

  private async recordLocalAdoption(registryId: string) {
    const adopted = parseStringList(
      await this.settings.getAppSetting(ACP_REGISTRY_ADOPTED_LOCAL_SETTING_KEY),
    );
    if (adopted.includes(registryId)) {
      return;
    }
    await this.settings.setAppSetting(
      ACP_REGISTRY_ADOPTED_LOCAL_SETTING_KEY,
      JSON.stringify([...adopted, registryId]),
    );
  }

  private async findInstallableEntry(registryId: string) {
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
    return entry;
  }

  private async installFromCatalog(registryId: string) {
    return installAcpRegistryAgent(
      await this.findInstallableEntry(registryId),
      this.userDataPath,
      this.prefetch,
    );
  }

  async listUpdates(
    options: { forceRefresh?: boolean } = {},
  ): Promise<AcpRegistryAgentUpdate[]> {
    await this.ready;
    const catalogLatest = new Map(
      (await this.entries(options.forceRefresh ?? false)).map((entry) => [
        entry.agent.registryId,
        entry.agent.version,
      ]),
    );
    const updates = await Promise.all(
      this.installed.map(
        async (agent): Promise<AcpRegistryAgentUpdate | null> => {
          if (agent.distribution === "local" || agent.version === "") {
            return null;
          }
          const local = await this.findLocal(agent.registryId);
          const latestVersion = newestVersion([
            catalogLatest.get(agent.registryId),
            local?.version,
          ]);
          if (
            !latestVersion ||
            compareAgentVersions(latestVersion, agent.version) <= 0
          ) {
            return null;
          }
          return {
            agentId: agent.agentId,
            registryId: agent.registryId,
            installedVersion: agent.version,
            latestVersion,
          };
        },
      ),
    );
    return updates.filter(
      (update): update is AcpRegistryAgentUpdate => update !== null,
    );
  }

  async update(agentId: AcpRegistryAgentId) {
    await this.ready;
    const agent = this.installed.find((item) => item.agentId === agentId);
    if (!agent) {
      throw new Error(`ACP Registry agent ${agentId} is not installed`);
    }
    if (agent.distribution === "local") {
      throw new Error(
        `${agent.name} uses a command installed outside Cocurdex; update it with its own installer`,
      );
    }
    return this.save(agent.registryId, async () => {
      const local = await this.findLocal(agent.registryId);
      const catalogVersion = (await this.entries(false)).find(
        (entry) => entry.agent.registryId === agent.registryId,
      )?.agent.version;
      return local?.version &&
        (!catalogVersion ||
          compareAgentVersions(local.version, catalogVersion) >= 0)
        ? local
        : this.installFromCatalog(agent.registryId);
    });
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

  async setAuthMethod(agentId: AcpRegistryAgentId, methodId: string | null) {
    await this.ready;
    const agent = this.installed.find((item) => item.agentId === agentId);
    if (!agent) {
      throw new Error(`ACP Registry agent ${agentId} is not installed`);
    }
    const { authMethodId: _previous, ...rest } = agent;
    const updated = methodId ? { ...rest, authMethodId: methodId } : rest;
    await this.persist(
      this.installed.map((item) => (item === agent ? updated : item)),
    );
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
