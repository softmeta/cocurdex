import {
  readAdapterRateLimits as probeAdapterRateLimits,
  resetAcpProviderModelsCache,
} from "@cocurdex/agent-adapters";
import {
  createAgentRegistry,
  getAgentRuntimeOwnership,
} from "@cocurdex/agent-core";
import {
  type AcpRegistryAgentId,
  type AgentDescriptor,
  type AgentId,
  type CocurdexDaemonEvent,
  canDisableAgent,
  DISABLED_AGENTS_SETTING_KEY,
  isAcpRegistryAgentId,
  parseDisabledAgentIds,
  type SessionRecord,
} from "@cocurdex/shared";
import type { AcpRegistryService } from "../acp-registry";
import type { DaemonState } from "../state";
import {
  discoverAgentSessionModes,
  discoverInstalledAgentCapabilities,
} from "./agent-capability-discovery";
import { createAgentInstallationProbes } from "./agent-installation-probes";

export interface AgentCatalogDeps {
  state: Pick<
    DaemonState,
    | "getAppSetting"
    | "setAppSetting"
    | "recordAgentVersions"
    | "agentCapabilityCache"
  >;
  acpRegistry: AcpRegistryService;
  cancelLogin(agentId: AgentId): void;
  liveSessionIds(agentId: AgentId): string[];
  disposeSession(sessionId: string): Promise<void>;
  emit(event: CocurdexDaemonEvent): void;
}

export class AgentCatalog {
  private readonly agentInstallationProbes = createAgentInstallationProbes();

  constructor(private readonly deps: AgentCatalogDeps) {}

  async readDisabledAgentIds(): Promise<Set<AgentId>> {
    return parseDisabledAgentIds(
      await this.deps.state.getAppSetting(DISABLED_AGENTS_SETTING_KEY),
    );
  }

  async isAgentDisabled(agentId: AgentId): Promise<boolean> {
    if (!canDisableAgent(agentId)) {
      return false;
    }
    return (await this.readDisabledAgentIds()).has(agentId);
  }

  async assertAgentEnabled(agentId: AgentId): Promise<void> {
    if (await this.isAgentDisabled(agentId)) {
      const descriptor = createAgentRegistry()
        .list()
        .find((item) => item.id === agentId);
      throw new Error(`${descriptor?.label ?? agentId} is disabled.`);
    }
  }

  async setAgentEnabled(agentId: AgentId, enabled: boolean) {
    if (!enabled && !canDisableAgent(agentId)) {
      throw new Error("Built-in agent Pi cannot be disabled.");
    }
    const disabledIds = await this.readDisabledAgentIds();
    if (enabled) {
      disabledIds.delete(agentId);
    } else {
      disabledIds.add(agentId);
    }
    await this.replaceDisabledAgentIds([...disabledIds]);
    return this.listAgents();
  }

  async replaceDisabledAgentIds(nextAgentIds: readonly AgentId[]) {
    const previous = await this.readDisabledAgentIds();
    const next = new Set(nextAgentIds.filter(canDisableAgent));
    await this.deps.state.setAppSetting(
      DISABLED_AGENTS_SETTING_KEY,
      JSON.stringify([...next]),
    );
    const newlyDisabled = [...next].filter((id) => !previous.has(id));
    for (const agentId of newlyDisabled) {
      this.deps.cancelLogin(agentId);
      await Promise.all(
        this.deps
          .liveSessionIds(agentId)
          .map((sessionId) => this.deps.disposeSession(sessionId)),
      );
      if (isAcpRegistryAgentId(agentId)) {
        resetAcpProviderModelsCache(agentId);
      }
    }
    this.deps.emit({
      type: "data.changed",
      areas: ["agent", "settings"],
    });
  }

  async detectAgents(only?: AgentId) {
    await this.deps.acpRegistry.ready;
    const disabledIds = await this.readDisabledAgentIds();
    const listDescriptors = () =>
      createAgentRegistry()
        .list()
        .filter((descriptor) => !only || descriptor.id === only);
    const enabledDescriptors = () =>
      listDescriptors().filter((descriptor) => !disabledIds.has(descriptor.id));
    const pathBefore = process.env.PATH;
    let detectedEnabled = await this.agentInstallationProbes.detect(
      enabledDescriptors(),
    );
    if (process.env.PATH !== pathBefore) {
      await this.deps.acpRegistry.refreshLocalClis();
      detectedEnabled = await this.agentInstallationProbes.detect(
        enabledDescriptors(),
      );
    }
    this.deps.state.recordAgentVersions(detectedEnabled);
    const detectedById = new Map(
      detectedEnabled.map((agent) => [agent.id, agent]),
    );
    return listDescriptors().map((descriptor): AgentDescriptor => {
      if (disabledIds.has(descriptor.id)) {
        const ownership = getAgentRuntimeOwnership(descriptor.id);
        return {
          ...descriptor,
          enabled: false,
          availability: "missing",
          installation: {
            executableName:
              ownership.kind === "external" ? ownership.executableName : null,
            executablePath: null,
            version:
              ownership.kind === "external"
                ? (ownership.version ?? null)
                : null,
          },
        };
      }
      const detected = detectedById.get(descriptor.id) ?? descriptor;
      return { ...detected, enabled: true };
    });
  }

  async listAgents(only?: AgentId) {
    const agents = await this.detectAgents(only);
    return this.discoverAgentCapabilities(agents);
  }

  async listAcpRegistryUpdates(options: { forceRefresh?: boolean } = {}) {
    if (options.forceRefresh) {
      this.agentInstallationProbes.invalidate();
    }
    const [updates, disabledIds] = await Promise.all([
      this.deps.acpRegistry.listUpdates(options),
      this.readDisabledAgentIds(),
    ]);
    return updates.filter((update) => !disabledIds.has(update.agentId));
  }

  discoverAgentCapabilities(agents: AgentDescriptor[]) {
    return discoverInstalledAgentCapabilities(agents, {
      cache: this.deps.state.agentCapabilityCache,
    });
  }

  installAcpRegistryAgent(registryId: string) {
    return this.deps.acpRegistry.install(registryId).then((agent) => {
      this.agentInstallationProbes.invalidate();
      resetAcpProviderModelsCache(agent.agentId);
      return agent;
    });
  }

  installAcpRegistryCommand(params: {
    registryId: string;
    command: string;
    args: string[];
  }) {
    return this.deps.acpRegistry
      .installCommand(params.registryId, params.command, params.args)
      .then((agent) => {
        this.agentInstallationProbes.invalidate();
        resetAcpProviderModelsCache(agent.agentId);
        return agent;
      });
  }

  async updateAcpRegistryAgent(agentId: AcpRegistryAgentId) {
    const agent = await this.deps.acpRegistry.update(agentId);
    this.agentInstallationProbes.invalidate();
    resetAcpProviderModelsCache(agent.agentId);
    return agent;
  }

  async uninstallAcpRegistryAgent(agentId: AcpRegistryAgentId) {
    await this.deps.acpRegistry.uninstall(agentId);
    const disabledIds = await this.readDisabledAgentIds();
    if (disabledIds.delete(agentId)) {
      await this.deps.state.setAppSetting(
        DISABLED_AGENTS_SETTING_KEY,
        JSON.stringify([...disabledIds]),
      );
    }
    this.agentInstallationProbes.invalidate();
    resetAcpProviderModelsCache(agentId);
    return null;
  }

  async readAgentSessionModes(agentId: AgentId) {
    if (await this.isAgentDisabled(agentId)) {
      return [];
    }
    const agents = await this.detectAgents(agentId);
    return discoverAgentSessionModes(agents, {
      agentId,
      cache: this.deps.state.agentCapabilityCache,
    });
  }

  async readAdapterRateLimits(agentIds: AgentId[]) {
    const disabledIds = await this.readDisabledAgentIds();
    const enabledIds = agentIds.filter((id) => !disabledIds.has(id));
    if (enabledIds.length === 0) {
      return {};
    }
    return probeAdapterRateLimits(enabledIds);
  }

  async supportsSteering(session: SessionRecord) {
    const agents = await this.listAgents(session.agentType);
    const agent = agents.find((item) => item.id === session.agentType);
    return agent?.capabilities.supportsSteering ?? false;
  }

  async ensureAvailable(agentId: AgentId) {
    const agents = await this.listAgents(agentId);
    const agent = agents.find((item) => item.id === agentId);

    if (agent?.enabled === false) {
      throw new Error(`${agent.label} is disabled.`);
    }

    if (agent?.availability === "available") {
      return agent;
    }

    throw new Error(
      `${agent?.label ?? agentId} is not available on this machine.`,
    );
  }
}
