import {
  type AgentDescriptor,
  type BuiltInAgentId,
  getBuiltInAgentDescriptor,
} from "@cocurdex/shared";

export const BUILT_IN_AGENT_DISPLAY_ORDER: readonly BuiltInAgentId[] = [
  "pi",
  "codex",
  "claude-agent",
  "opencode",
];

export const defaultAgentDescriptors: AgentDescriptor[] =
  BUILT_IN_AGENT_DISPLAY_ORDER.map(getBuiltInAgentDescriptor);
