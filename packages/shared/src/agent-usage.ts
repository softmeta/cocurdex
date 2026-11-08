// Snapshot of token usage for one agent run / turn. Field names mirror the
// Anthropic API + Claude Code SDK so adapters can forward the value with
// minimal translation. Adapters that cannot observe usage may simply not
// emit `usage.updated` events; consumers must treat usage as best-effort.
//
// `inputTokens` / `outputTokens` / cache / cost are treated as **deltas** that
// accumulate across a session. `contextTokensUsed` / `contextWindowSize` are
// **absolute snapshots** of the model context window (Grok ACP's
// `_meta.totalTokens`, ACP `usage_update`, etc.) — latest value wins.
export interface AgentUsageRecord {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  reasoningOutputTokens?: number;
  totalCostUsd?: number;
  /** Absolute tokens currently filling the model context window. */
  contextTokensUsed?: number | null;
  /** Absolute context window size reported by the agent, when available. */
  contextWindowSize?: number;
}

/** Merge a usage delta into stored session usage (absolute fields replace). */
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

/** Current context fill, when the adapter provides an absolute snapshot. */
export function getContextUsageTokens(usage: AgentUsageRecord): number | null {
  return typeof usage.contextTokensUsed === "number"
    ? usage.contextTokensUsed
    : null;
}

export interface AgentUsageUpdatedEvent {
  type: "usage.updated";
  sessionId: string;
  usage: AgentUsageRecord;
  /** Defaults to the active user turn; session-only usage is never added to turn stats. */
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
  // Provider-supplied name for windows that share a `kind` but scope to one
  // model ("Opus", "Sonnet", …). Part of the window identity: without it the
  // per-model weekly buckets would collapse into a single "weekly" row.
  label?: string;
}

// Prepaid balance that keeps working past the plan windows. Money, not a
// window, so it is reported next to them rather than as one of them.
export interface AgentUsageCredits {
  usedAmount: number;
  limitAmount: number;
  currency: string;
}

export interface AgentRateLimitsRecord {
  windows: AgentRateLimitWindow[];
  updatedAt: string;
  // Subscription the windows belong to ("pro", "max", …), when the provider
  // names one.
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

// How the context window is spent, for adapters that can see its composition
// (currently only the Claude Agent SDK, which also backs Claude Code's
// `/context`). Informational only — the footer meter still runs off
// `AgentUsageRecord`, which every adapter can produce.
export interface AgentContextBreakdownItem {
  name: string;
  tokens: number;
  // Secondary label: MCP server name, memory file type, skill source, …
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
  // Free-form count summary, e.g. "12/54" for partially included skills.
  summary?: string;
  items: AgentContextBreakdownItem[];
}

export interface AgentContextBreakdownRecord {
  // Top-level slices of the window (system prompt, tools, messages, …), in the
  // order the agent reports them.
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
