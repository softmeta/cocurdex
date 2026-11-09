export interface AgentUsageRecord {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  reasoningOutputTokens?: number;
  totalCostUsd?: number;
  contextTokensUsed?: number | null;
  contextWindowSize?: number;
}

export function mergeUsageRecords(
  current: AgentUsageRecord | null | undefined,
  delta: AgentUsageRecord,
): AgentUsageRecord {
  return {
    inputTokens: (current?.inputTokens ?? 0) + delta.inputTokens,
    outputTokens: (current?.outputTokens ?? 0) + delta.outputTokens,
    cacheCreationInputTokens:
      (current?.cacheCreationInputTokens ?? 0) +
      (delta.cacheCreationInputTokens ?? 0),
    cacheReadInputTokens:
      (current?.cacheReadInputTokens ?? 0) + (delta.cacheReadInputTokens ?? 0),
    reasoningOutputTokens:
      (current?.reasoningOutputTokens ?? 0) +
      (delta.reasoningOutputTokens ?? 0),
    totalCostUsd:
      delta.totalCostUsd == null && current?.totalCostUsd == null
        ? undefined
        : (current?.totalCostUsd ?? 0) + (delta.totalCostUsd ?? 0),
    contextTokensUsed:
      delta.contextTokensUsed === undefined
        ? current?.contextTokensUsed
        : delta.contextTokensUsed,
    contextWindowSize: delta.contextWindowSize ?? current?.contextWindowSize,
  };
}

export function getContextUsageTokens(usage: AgentUsageRecord): number | null {
  return typeof usage.contextTokensUsed === "number"
    ? usage.contextTokensUsed
    : null;
}

export interface AgentUsageUpdatedEvent {
  type: "usage.updated";
  sessionId: string;
  usage: AgentUsageRecord;
  attribution?: "active-turn" | "session-only";
  receivedAt: string;
}

export type AgentRateLimitWindowKind =
  | "five-hour"
  | "weekly"
  | "monthly"
  | "primary"
  | "secondary";

export interface AgentRateLimitWindow {
  kind: AgentRateLimitWindowKind;
  usedPercent: number;
  resetsAt?: string;
  windowDurationMinutes?: number;
  label?: string;
}

export interface AgentUsageCredits {
  usedAmount: number;
  limitAmount: number;
  currency: string;
}

export interface AgentRateLimitsRecord {
  windows: AgentRateLimitWindow[];
  updatedAt: string;
  planLabel?: string;
  credits?: AgentUsageCredits;
}

export type AgentRateLimitsErrorCode =
  | "authentication-required"
  | "probe-failed"
  | "timed-out";

export type AgentRateLimitsReadResult =
  | {
      status: "available";
      rateLimits: AgentRateLimitsRecord;
    }
  | {
      status: "unavailable";
    }
  | {
      status: "error";
      code: AgentRateLimitsErrorCode;
      message: string;
    };

export interface AgentRateLimitsUpdatedEvent {
  type: "rate_limits.updated";
  sessionId: string;
  rateLimits: AgentRateLimitsRecord;
}

export interface AgentContextBreakdownItem {
  name: string;
  tokens: number;
  detail?: string;
}

export type AgentContextBreakdownGroupId =
  | "agents"
  | "deferredTools"
  | "mcpTools"
  | "memoryFiles"
  | "skills"
  | "slashCommands"
  | "systemPrompt"
  | "systemTools";

export interface AgentContextBreakdownGroup {
  id: AgentContextBreakdownGroupId;
  tokens: number;
  summary?: string;
  items: AgentContextBreakdownItem[];
}

export interface AgentContextBreakdownRecord {
  categories: AgentContextBreakdownItem[];
  groups: AgentContextBreakdownGroup[];
  totalTokens: number;
  maxTokens: number;
  model?: string;
  updatedAt: string;
}

export interface AgentContextBreakdownUpdatedEvent {
  type: "context_breakdown.updated";
  sessionId: string;
  breakdown: AgentContextBreakdownRecord;
}
