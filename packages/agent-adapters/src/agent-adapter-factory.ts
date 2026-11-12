import type { AgentAdapter } from "@cocurdex/agent-core";
import type { AgentId } from "@cocurdex/shared";
import { findAgentPlugin } from "./agent-native";
import type { AgentRuntimePlugin } from "./agent-plugin";
import { listAgentSkills } from "./skills";

function withSkillSupport(
  agentId: AgentId,
  plugin: AgentRuntimePlugin,
  adapter: AgentAdapter,
): AgentAdapter {
  const discoverCapabilities = adapter.discoverCapabilities?.bind(adapter);
  const discoverSessionModes = adapter.discoverSessionModes?.bind(adapter);
  const forkProviderSession = adapter.forkProviderSession?.bind(adapter);
  const listAdapterSlashCommands = adapter.listSlashCommands?.bind(adapter);
  return {
    getDescriptor: () => adapter.getDescriptor(),
    ...(discoverCapabilities ? { discoverCapabilities } : {}),
    ...(discoverSessionModes ? { discoverSessionModes } : {}),
    ...(forkProviderSession ? { forkProviderSession } : {}),
    ...(adapter.injectsContextHandoff ? { injectsContextHandoff: true } : {}),
    ...(adapter.runsInProcess ? { runsInProcess: true } : {}),
    createSession: (payload, onEvent) =>
      adapter.createSession(payload, onEvent),
    listSlashCommands: (payload) =>
      plugin.slashCommands === "adapter" && listAdapterSlashCommands
        ? listAdapterSlashCommands(payload)
        : listAgentSkills(agentId, payload),
  };
}

export function createAgentAdapter(agentId: AgentId): AgentAdapter {
  const plugin = findAgentPlugin(agentId);
  if (!plugin) throw new Error(`Unknown agent: ${agentId}`);
  return withSkillSupport(agentId, plugin, plugin.createAdapter());
}
