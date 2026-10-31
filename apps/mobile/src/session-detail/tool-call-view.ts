import {
  type AgentToolCallRecord,
  type AgentToolCallResult,
  formatToolCallData,
  formatToolCallOutput,
} from "@cocurdex/shared";

export const OUTPUT_TAIL_CHARACTERS = 64 * 1024;

const COMMAND_KEYS = ["command", "cmd"] as const;

export function toolCallInputText(call: AgentToolCallRecord) {
  const input = call.rawInput;
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const record = input as Record<string, unknown>;
    const command = COMMAND_KEYS.map((key) => record[key]).find(
      (value) => typeof value === "string" && value !== "",
    );
    if (typeof command === "string") return command;
  }
  return formatToolCallData(input);
}

export function toolCallResultSource(
  call: AgentToolCallRecord,
  loaded: AgentToolCallResult | null | undefined,
): AgentToolCallResult | null {
  if (call.content !== undefined) {
    return { content: call.content, rawOutput: call.rawOutput };
  }
  return loaded ?? null;
}

export function toolCallOutputTail(
  result: AgentToolCallResult | null,
  limit = OUTPUT_TAIL_CHARACTERS,
) {
  const text = result
    ? formatToolCallOutput(result.content, result.rawOutput)
    : null;
  if (!text) return null;
  if (text.length <= limit) return { text, truncated: false };
  return { text: text.slice(text.length - limit), truncated: true };
}

export type ToolCallOutputPlaceholder = "loading" | "failed" | "none";

export function toolCallOutputPlaceholder(
  needsResult: boolean,
  fetched: { data: AgentToolCallResult | null | undefined; error?: unknown },
): ToolCallOutputPlaceholder {
  if (!needsResult || fetched.data !== undefined) return "none";
  return fetched.error ? "failed" : "loading";
}

export function toolCallDurationMs(call: AgentToolCallRecord) {
  if (call.status !== "completed" && call.status !== "failed") return null;
  const elapsed = Date.parse(call.updatedAt) - Date.parse(call.startedAt);
  return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : null;
}
