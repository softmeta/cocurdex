import type { AgentToolCallRecord } from "./contracts";

export type ActivityAction =
  | "command"
  | "edit"
  | "fetch"
  | "other"
  | "read"
  | "search"
  | "skill"
  | "subagent";

export type ActivityActionCount = { action: ActivityAction; count: number };

export type ToolActionSummary = {
  actions: ActivityActionCount[];
  otherCount: number;
};

const EDIT_KINDS = new Set(["delete", "edit", "move"]);
const COMMAND_KINDS = new Set(["exec", "execute", "run_terminal_command"]);
const MAX_SUMMARY_ACTIONS = 2;

const ACTION_PRIORITY: Record<ActivityAction, number> = {
  command: 0,
  edit: 0,
  subagent: 0,
  fetch: 1,
  read: 1,
  search: 1,
  skill: 1,
  other: 2,
};

function rawInputField(toolCall: AgentToolCallRecord, field: string) {
  const rawInput = toolCall.rawInput;
  if (typeof rawInput !== "object" || rawInput === null) {
    return undefined;
  }
  return (rawInput as Record<string, unknown>)[field];
}

function isSubagentToolCall(toolCall: AgentToolCallRecord) {
  return Boolean(toolCall.subagent?.sessionId);
}

function isCommandToolCall(toolCall: AgentToolCallRecord) {
  return (
    COMMAND_KINDS.has(toolCall.kind ?? "") ||
    (!isSubagentToolCall(toolCall) && /^(execute|run)\b/i.test(toolCall.title))
  );
}

export function getActivityAction(
  toolCall: AgentToolCallRecord,
): ActivityAction {
  if (isSubagentToolCall(toolCall)) return "subagent";
  if (typeof rawInputField(toolCall, "skill") === "string") return "skill";
  if (isCommandToolCall(toolCall)) return "command";
  if (toolCall.kind === "read") return "read";
  if (EDIT_KINDS.has(toolCall.kind ?? "")) return "edit";
  if (toolCall.kind === "search") return "search";
  if (toolCall.kind === "fetch") return "fetch";
  return "other";
}

function countActionTargets(
  action: ActivityAction,
  toolCalls: readonly AgentToolCallRecord[],
) {
  if (action !== "edit") return toolCalls.length;
  const paths = new Set<string>();
  let withoutPath = 0;
  for (const toolCall of toolCalls) {
    if (toolCall.locations.length === 0) withoutPath += 1;
    for (const location of toolCall.locations) paths.add(location.path);
  }
  return paths.size + withoutPath;
}

export function summarizeToolActions(
  toolCalls: readonly AgentToolCallRecord[],
): ToolActionSummary {
  const byAction = new Map<ActivityAction, AgentToolCallRecord[]>();
  for (const toolCall of toolCalls) {
    const action = getActivityAction(toolCall);
    byAction.set(action, [...(byAction.get(action) ?? []), toolCall]);
  }
  const ranked = [...byAction.entries()].map(([action, calls], index) => ({
    action,
    calls,
    index,
  }));
  const selected = ranked
    .filter(({ action }) => action !== "other" || ranked.length === 1)
    .sort(
      (a, b) =>
        ACTION_PRIORITY[a.action] - ACTION_PRIORITY[b.action] ||
        a.index - b.index,
    )
    .slice(0, MAX_SUMMARY_ACTIONS)
    .sort((a, b) => a.index - b.index);
  const summarizedCallCount = selected.reduce(
    (count, { calls }) => count + calls.length,
    0,
  );
  return {
    actions: selected.map(({ action, calls }) => ({
      action,
      count: countActionTargets(action, calls),
    })),
    otherCount: toolCalls.length - summarizedCallCount,
  };
}
