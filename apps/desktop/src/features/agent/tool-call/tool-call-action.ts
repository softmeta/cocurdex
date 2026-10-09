import type { AgentToolCallRecord } from "@cocurdex/shared";
import { isCommandToolCall, isSubagentToolCall } from "./tool-call-utils";

export type ActivityAction =
  | "command"
  | "edit"
  | "fetch"
  | "other"
  | "read"
  | "search"
  | "skill"
  | "subagent";

const EDIT_KINDS = new Set(["delete", "edit", "move"]);

function getRawInputField(toolCall: AgentToolCallRecord, field: string) {
  const rawInput = toolCall.rawInput;
  if (typeof rawInput !== "object" || rawInput === null) {
    return undefined;
  }
  return (rawInput as Record<string, unknown>)[field];
}

export function getActivityAction(
  toolCall: AgentToolCallRecord,
): ActivityAction {
  if (isSubagentToolCall(toolCall)) {
    return "subagent";
  }
  if (typeof getRawInputField(toolCall, "skill") === "string") {
    return "skill";
  }
  if (isCommandToolCall(toolCall)) {
    return "command";
  }
  if (toolCall.kind === "read") {
    return "read";
  }
  if (EDIT_KINDS.has(toolCall.kind ?? "")) {
    return "edit";
  }
  if (toolCall.kind === "search") {
    return "search";
  }
  if (toolCall.kind === "fetch") {
    return "fetch";
  }
  return "other";
}
