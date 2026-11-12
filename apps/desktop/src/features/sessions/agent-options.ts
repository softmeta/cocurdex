import {
  type AgentDescriptor,
  type BuiltInAgentId,
  getBuiltInAgentDescriptor,
} from "@cocurdex/shared";

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
  id: BuiltInAgentId;
  name: string;
}[];

export const selectableAgentOptions = agentOptions;

export const defaultAgentDescriptors: AgentDescriptor[] = agentOptions.map(
  (agent) => getBuiltInAgentDescriptor(agent.id),
);

export function getCompactWorkspacePath(path: string) {
  return path.replace(/^\/Users\/[^/]+/, "~");
}
