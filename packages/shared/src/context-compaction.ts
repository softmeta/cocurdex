import type { AgentToolCallRecord } from "./contracts";

export const CONTEXT_COMPACTION_TOOL_KIND = "context_compaction";

export type ContextCompactionTrigger = "auto" | "manual";

export interface ContextCompactionDetails {
  trigger: ContextCompactionTrigger | null;
  tokensBefore: number | null;
  tokensAfter: number | null;
  error: string | null;
}

export interface ContextCompactionResult {
  status: "completed" | "failed";
  trigger?: ContextCompactionTrigger | null;
  tokensBefore?: number | null;
  tokensAfter?: number | null;
  error?: string | null;
  at?: string;
}

const EMPTY_DETAILS: ContextCompactionDetails = {
  trigger: null,
  tokensBefore: null,
  tokensAfter: null,
  error: null,
};

export function isContextCompactionToolCall(
  toolCall: Pick<AgentToolCallRecord, "kind">,
) {
  return toolCall.kind === CONTEXT_COMPACTION_TOOL_KIND;
}

export function normalizeCompactionTokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : null;
}

function readTrigger(value: unknown): ContextCompactionTrigger | null {
  return value === "auto" || value === "manual" ? value : null;
}

function readError(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function readContextCompactionDetails(
  toolCall: Pick<AgentToolCallRecord, "rawInput">,
): ContextCompactionDetails {
  const raw = toolCall.rawInput;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return EMPTY_DETAILS;
  }
  const record = raw as Record<string, unknown>;
  return {
    trigger: readTrigger(record.trigger),
    tokensBefore: normalizeCompactionTokenCount(record.tokensBefore),
    tokensAfter: normalizeCompactionTokenCount(record.tokensAfter),
    error: readError(record.error),
  };
}

function toRawInput(details: ContextCompactionDetails) {
  return Object.fromEntries(
    Object.entries(details).filter(([, value]) => value !== null),
  );
}

export function createContextCompactionToolCall(input: {
  id: string;
  sessionId: string;
  trigger?: ContextCompactionTrigger | null;
  at?: string;
}): AgentToolCallRecord {
  const at = input.at ?? new Date().toISOString();
  return {
    id: input.id,
    sessionId: input.sessionId,
    title: "Compact context",
    kind: CONTEXT_COMPACTION_TOOL_KIND,
    status: "in_progress",
    content: [],
    rawInput: toRawInput({ ...EMPTY_DETAILS, trigger: input.trigger ?? null }),
    locations: [],
    startedAt: at,
    updatedAt: at,
  };
}

export function finishContextCompactionToolCall(
  toolCall: AgentToolCallRecord,
  result: ContextCompactionResult,
): AgentToolCallRecord {
  const previous = readContextCompactionDetails(toolCall);
  const details: ContextCompactionDetails = {
    trigger: result.trigger ?? previous.trigger,
    tokensBefore:
      normalizeCompactionTokenCount(result.tokensBefore) ??
      previous.tokensBefore,
    tokensAfter:
      normalizeCompactionTokenCount(result.tokensAfter) ?? previous.tokensAfter,
    error: result.status === "failed" ? readError(result.error) : null,
  };
  return {
    ...toolCall,
    status: result.status,
    content: details.error ? [{ type: "text", text: details.error }] : [],
    rawInput: toRawInput(details),
    updatedAt: result.at ?? new Date().toISOString(),
  };
}
