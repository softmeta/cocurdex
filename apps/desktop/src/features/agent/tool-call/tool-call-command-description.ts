import type { AgentToolCallRecord } from "@cocurdex/shared";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function getCommandDescription(
  toolCall: Pick<AgentToolCallRecord, "rawInput">,
) {
  const rawInput = asRecord(toolCall.rawInput);
  const input = asRecord(rawInput?.input) ?? rawInput;
  const description = input?.description;
  if (typeof description !== "string") {
    return null;
  }
  const singleLine = description.replace(/\s+/g, " ").trim();
  return singleLine || null;
}
