import {
  type AgentDescriptor,
  type AgentId,
  agentRuntimeAxisCapabilities,
  getAgentSessionTitleStrategy,
  getFallbackAgentPermissionModes,
} from "@cocurdex/shared";

// Display order: Pi → Grok Build → Codex → Claude Agent → OpenCode.
export const agentOptions = [
  { id: "pi", name: "Pi", descKey: "pi" },
  {
    id: "grok-build",
    name: "Grok Build",
    descKey: "grokBuild",
  },
  {
    id: "codex",
    name: "Codex",
    descKey: "codex",
  },
  {
    id: "claude-agent",
    name: "Claude Agent",
    descKey: "claudeCli",
  },
  {
    id: "opencode",
    name: "OpenCode",
    descKey: "opencode",
  },
] satisfies {
  descKey: "claudeCli" | "codex" | "grokBuild" | "opencode" | "pi";
  id: AgentId;
  name: string;
}[];

export const selectableAgentOptions = agentOptions;

function getWriteModes(agentId: AgentId) {
  if (agentId === "grok-build") {
    return ["native-write"] as const;
  }

  if (agentId === "codex" || agentId === "pi") {
    return ["read-only"] as const;
  }

  return ["read-only", "native-write"] as const;
}

export const defaultAgentDescriptors = agentOptions.map((agent) => ({
  id: agent.id,
  label: agent.name,
  availability: "available",
  capabilities: {
    collaborationModes: agent.id === "pi" ? ["default"] : ["default", "plan"],
    permissionModes: getFallbackAgentPermissionModes(agent.id),
    writeModes: [...getWriteModes(agent.id)],
    supportsSteering: ["claude-agent", "codex", "pi"].includes(agent.id),
    supportsStreaming: true,
    supportsSelections: true,
    sessionTitleStrategy: getAgentSessionTitleStrategy(agent.id),
    transport: agent.id === "grok-build" ? "acp" : "native",
    runtimeAxes: agentRuntimeAxisCapabilities[agent.id],
  },
})) satisfies AgentDescriptor[];

export function getCompactWorkspacePath(path: string) {
  return path.replace(/^\/Users\/[^/]+/, "~");
}
