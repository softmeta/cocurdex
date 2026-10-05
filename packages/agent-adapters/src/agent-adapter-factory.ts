import type { AgentAdapter } from "@cocurdex/agent-core";
import { type AgentId, isAcpRegistryAgentId } from "@cocurdex/shared";
import { createAcpRegistryAdapter } from "./acp-registry";
import { createClaudeCliAdapter } from "./claude-cli";
import { createCodexAdapter } from "./codex";
import { createOpencodeAdapter } from "./opencode";
import { createPiSdkAdapter } from "./pi-sdk";
import { listAgentSkills } from "./skills";

function withSkillSupport(
  agentId: AgentId,
  adapter: AgentAdapter,
): AgentAdapter {
  const discoverCapabilities = adapter.discoverCapabilities?.bind(adapter);
  return {
    getDescriptor: () => adapter.getDescriptor(),
    ...(discoverCapabilities ? { discoverCapabilities } : {}),
    createSession: (payload, onEvent) =>
      adapter.createSession(payload, onEvent),
    listSlashCommands: (payload) => {
      if (agentId === "pi" && adapter.listSlashCommands) {
        return adapter.listSlashCommands(payload);
      }
      return listAgentSkills(agentId, payload);
    },
  };
}

export function createAgentAdapter(agentId: AgentId): AgentAdapter {
  if (isAcpRegistryAgentId(agentId)) {
    return withSkillSupport(agentId, createAcpRegistryAdapter(agentId));
  }
  let adapter: AgentAdapter;
  switch (agentId) {
    case "claude-agent":
      adapter = createClaudeCliAdapter();
      break;
    case "codex":
      adapter = createCodexAdapter();
      break;
    case "opencode":
      adapter = createOpencodeAdapter();
      break;
    case "pi":
      adapter = createPiSdkAdapter();
      break;
  }
  return withSkillSupport(agentId, adapter);
}
