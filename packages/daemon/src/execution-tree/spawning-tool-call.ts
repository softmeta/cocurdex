import type { AgentToolCallRecord, SessionRecord } from "@cocurdex/shared";

const SPAWN_TOOL_PATTERN = /spawn_teammate$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function spawnedNames(toolCall: AgentToolCallRecord) {
  const raw = asRecord(toolCall.rawInput);
  const input = asRecord(raw?.input) ?? raw;
  return [input?.title, input?.name]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim());
}

function isSpawnFor(toolCall: AgentToolCallRecord, child: SessionRecord) {
  return (
    SPAWN_TOOL_PATTERN.test(toolCall.title) &&
    toolCall.startedAt <= child.createdAt &&
    spawnedNames(toolCall).includes(child.title)
  );
}

export function findSpawningToolCall(
  child: SessionRecord,
  toolCalls: AgentToolCallRecord[],
  claimed: ReadonlySet<string>,
) {
  return toolCalls
    .filter((toolCall) => !claimed.has(toolCall.id))
    .filter((toolCall) => isSpawnFor(toolCall, child))
    .at(-1);
}
