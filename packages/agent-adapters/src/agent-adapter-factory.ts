import type { AgentAdapter } from "@cocurdex/agent-core";
import type { AgentId } from "@cocurdex/shared";
import { createClaudeCliAdapter } from "./claude-cli";
import { createCodexAdapter } from "./codex";
import { createGrokBuildAdapter } from "./grok-build";
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
  let adapter: AgentAdapter;
  switch (agentId) {
    case "claude-agent":
      adapter = createClaudeCliAdapter();
      break;
    case "codex":
      adapter = createCodexAdapter();
      break;
    case "grok-build":
      adapter = createGrokBuildAdapter();
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
