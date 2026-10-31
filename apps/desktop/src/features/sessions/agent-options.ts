import {
  type AgentDescriptor,
  type AgentId,
  type AgentSessionMode,
  agentRuntimeAxisCapabilities,
  getAgentSessionTitleStrategy,
  getFallbackAgentPermissionModes,
  PLAN_MODE_ID,
} from "@cocurdex/shared";

function planSessionModes(): AgentSessionMode[] {
  return [
    { id: "default", name: "Default" },
    { id: PLAN_MODE_ID, name: "Plan" },
  ];
}

// Display order: Pi → Codex → Claude Agent → OpenCode; installed registry agents follow.
export const agentOptions = [
  { id: "pi", name: "Pi", descKey: "pi" },
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
  descKey: "claudeCli" | "codex" | "opencode" | "pi";
  id: AgentId;
  name: string;
}[];

export const selectableAgentOptions = agentOptions;

function getWriteModes(agentId: AgentId) {
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
    sessionModes: agent.id === "pi" ? [] : planSessionModes(),
    permissionModes: getFallbackAgentPermissionModes(agent.id),
    writeModes: [...getWriteModes(agent.id)],
    supportsSteering: ["claude-agent", "codex", "pi"].includes(agent.id),
    supportsStreaming: true,
    supportsSelections: true,
    sessionTitleStrategy: getAgentSessionTitleStrategy(agent.id),
    transport: "native",
    runtimeAxes: agentRuntimeAxisCapabilities[agent.id],
  },
})) satisfies AgentDescriptor[];

export function getCompactWorkspacePath(path: string) {
  return path.replace(/^\/Users\/[^/]+/, "~");
}
