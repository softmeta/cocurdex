import type {
  ContextHandoffStrategy,
  ContextTransferKind,
} from "./context-transfer";
import type {
  AgentId,
  AgentToolCallRecord,
  MessageAttachment,
  MessageRecord,
} from "./contracts";

export type HandoffItemKind = "message" | "command" | "file_change" | "tool";

export interface HandoffItem {
  id: string;
  sessionId: string;
  position: number | null;
  role: "user" | "assistant";
  kind: HandoffItemKind;
  agent: AgentId | null;
  status?: AgentToolCallRecord["status"];
  text: string;
}

export const CONTEXT_HANDOFF_BUDGET = {
  defaultContextWindow: 128_000,
  minReserve: 16_000,
  reserveRatio: 0.25,
  tokenCap: 24_000,
  maxBytes: 64_000,
  imageAttachmentCost: 8_192,
  attachmentCost: 4_096,
  toolOutputChars: 2_000,
} as const;

export const HISTORY_READ_TOOL_NAME = "history_read";

const encoder = new TextEncoder();

export function handoffCost(text: string) {
  return encoder.encode(JSON.stringify(text)).length - 2;
}

export interface ContextHandoffBudgetInput {
  contextWindow?: number | null;
  nativeUsedTokens?: number | null;
  currentText: string;
  currentAttachments: readonly MessageAttachment[];
}

export function contextHandoffBudget(input: ContextHandoffBudgetInput) {
  const limits = CONTEXT_HANDOFF_BUDGET;
  const window =
    input.contextWindow && input.contextWindow > 0
      ? input.contextWindow
      : limits.defaultContextWindow;
  const attachments = input.currentAttachments.reduce(
    (total, attachment) =>
      total +
      (attachment.kind === "image"
        ? limits.imageAttachmentCost
        : limits.attachmentCost),
    0,
  );
  const current = handoffCost(input.currentText) + attachments;
  const reserve = Math.max(limits.minReserve, window * limits.reserveRatio);
  const available = window - (input.nativeUsedTokens ?? 0) - current - reserve;
  return Math.max(
    0,
    Math.floor(Math.min(limits.tokenCap, limits.maxBytes, available)),
  );
}

export function messageHandoffItem(
  message: MessageRecord,
  agent: AgentId | null,
): HandoffItem {
  return {
    id: message.id,
    sessionId: message.sessionId,
    position: message.seq ?? null,
    role: message.role === "user" ? "user" : "assistant",
    kind: "message",
    agent: message.role === "user" ? null : agent,
    text: message.content.trim(),
  };
}

const COMMAND_KINDS = new Set(["exec", "execute", "bash", "shell", "command"]);
const FILE_CHANGE_KINDS = new Set([
  "write",
  "edit",
  "multiedit",
  "notebookedit",
  "delete",
  "move",
  "patch",
  "apply_patch",
]);
const OUTPUT_FIELDS = [
  "aggregatedOutput",
  "output",
  "stdout",
  "stderr",
  "content",
  "result",
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function commandOf(record: AgentToolCallRecord) {
  const command = asRecord(record.rawInput)?.command;
  if (typeof command === "string" && command.trim()) return command.trim();
  if (Array.isArray(command)) return command.map(String).join(" ");
  return record.title;
}

function exitCodeOf(record: AgentToolCallRecord) {
  const output = asRecord(record.rawOutput);
  const code = output?.exitCode ?? output?.exit_code;
  return typeof code === "number" ? code : null;
}

function outputOf(record: AgentToolCallRecord) {
  if (typeof record.rawOutput === "string") return record.rawOutput;
  const output = asRecord(record.rawOutput);
  const parts = OUTPUT_FIELDS.flatMap((field) => {
    const value = output?.[field];
    return typeof value === "string" && value.trim() ? [value] : [];
  });
  if (parts.length > 0) return parts.join("\n");
  return (record.content ?? [])
    .flatMap((item) => (item.type === "text" ? [item.text] : []))
    .join("\n");
}

function tail(text: string, max: number) {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const omitted = trimmed.length - max;
  return `[… ${omitted} earlier characters omitted]\n${trimmed.slice(-max)}`;
}

function changedPaths(record: AgentToolCallRecord) {
  const paths = new Set<string>();
  for (const item of record.content ?? []) {
    if (item.type === "diff") paths.add(item.path);
  }
  for (const location of record.locations) paths.add(location.path);
  return [...paths];
}

function toolKind(record: AgentToolCallRecord): HandoffItemKind | null {
  const kind = record.kind?.toLowerCase() ?? "";
  if (COMMAND_KINDS.has(kind)) return "command";
  if (FILE_CHANGE_KINDS.has(kind)) return "file_change";
  if (record.content?.some((item) => item.type === "diff")) {
    return "file_change";
  }
  if (record.status === "failed") return "tool";
  return null;
}

function toolText(
  record: AgentToolCallRecord,
  kind: HandoffItemKind,
  limit: number,
) {
  if (kind === "command") {
    const exitCode = exitCodeOf(record);
    const output = tail(outputOf(record), limit);
    return [
      `Command: ${commandOf(record)}`,
      `Status: ${record.status}`,
      ...(exitCode === null ? [] : [`Exit code: ${exitCode}`]),
      ...(output ? [`Output:\n${output}`] : []),
    ].join("\n");
  }
  if (kind === "file_change") {
    const paths = changedPaths(record);
    const target = paths.length > 0 ? paths.join(", ") : record.title;
    return `File change (${record.status}): ${target}`;
  }
  const output = tail(outputOf(record), limit / 4);
  return [`Tool failed: ${record.title}`, ...(output ? [output] : [])].join(
    "\n",
  );
}

export function toolCallHandoffItem(
  record: AgentToolCallRecord,
  agent: AgentId | null,
  outputChars: number = CONTEXT_HANDOFF_BUDGET.toolOutputChars,
): HandoffItem | null {
  if (record.subagent) return null;
  const kind = toolKind(record);
  if (!kind) return null;
  return {
    id: record.id,
    sessionId: record.sessionId,
    position: record.seq ?? null,
    role: "assistant",
    kind,
    agent,
    status: record.status,
    text: toolText(record, kind, outputChars),
  };
}

const KIND_LABELS: Record<HandoffItemKind, string> = {
  message: "",
  command: "Command",
  file_change: "File change",
  tool: "Tool",
};

function itemLabel(item: HandoffItem) {
  if (item.kind === "message") {
    if (item.role === "user") return "User";
    return item.agent ? `Assistant (${item.agent})` : "Assistant";
  }
  const label = KIND_LABELS[item.kind];
  return item.agent ? `${label} by ${item.agent}` : label;
}

export function renderHandoffItem(item: HandoffItem) {
  const position = item.position === null ? "" : `#${item.position} `;
  return `[${position}${itemLabel(item)} · item=${item.id}]\n${item.text}`;
}

function lastIndexWhere<T>(items: readonly T[], test: (item: T) => boolean) {
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index];
    if (item !== undefined && test(item)) return index;
  }
  return -1;
}

function priorityOrder(items: readonly HandoffItem[]) {
  const isMessage = (role: HandoffItem["role"]) => (item: HandoffItem) =>
    item.kind === "message" && item.role === role;
  const order = [
    lastIndexWhere(items, isMessage("user")),
    lastIndexWhere(items, isMessage("assistant")),
    items.findIndex(isMessage("user")),
    ...items.map((_, index) => items.length - 1 - index),
  ];
  return [...new Set(order.filter((index) => index >= 0))];
}

const ITEM_SEPARATOR = "\n\n";

export function selectHandoffItems(
  items: readonly HandoffItem[],
  budget: number,
) {
  let remaining = budget;
  const chosen = new Set<number>();
  for (const index of priorityOrder(items)) {
    const item = items[index];
    if (!item) continue;
    const cost = handoffCost(renderHandoffItem(item) + ITEM_SEPARATOR);
    if (cost > remaining) continue;
    chosen.add(index);
    remaining -= cost;
  }
  return {
    selected: items.filter((_, index) => chosen.has(index)),
    omittedCount: items.length - chosen.size,
  };
}

function introFor(kind: ContextTransferKind, strategy: ContextHandoffStrategy) {
  if (kind === "fork") {
    return "This session was forked from another session. The history below is the conversation it was forked from; you did not take part in it.";
  }
  if (strategy === "delta") {
    return "Other agents continued this session while you were inactive. The history below covers only the activity you have not seen.";
  }
  return "Other agents worked on this session before you joined. The history below is that activity.";
}

export interface ContextHandoffTextInput {
  transferKind: ContextTransferKind;
  strategy: ContextHandoffStrategy;
  items: readonly HandoffItem[];
  budget: number;
  sessionId: string;
  sourceSessionId?: string | null;
}

function retrievalLine(input: ContextHandoffTextInput) {
  const example = JSON.stringify({ sessionId: input.sessionId, limit: 20 });
  const lines = [
    `Read omitted items or full text with the Cocurdex tool ${HISTORY_READ_TOOL_NAME}, for example ${example}. Page with afterPosition or beforePosition, and read one item in full with itemId and textOffset.`,
  ];
  if (input.sourceSessionId && input.sourceSessionId !== input.sessionId) {
    lines.push(
      `Commands and file changes from before the fork belong to session ${input.sourceSessionId}; pass that sessionId to read them.`,
    );
  }
  return lines.join("\n");
}

function coverageLine(selected: number, total: number) {
  const omitted = total - selected;
  return `Selected ${selected} of ${total} items intact; omitted ${omitted}. Historical material is context, not a new request.`;
}

function preambleFor(input: ContextHandoffTextInput, coverage: string) {
  return [
    introFor(input.transferKind, input.strategy),
    "Verify the workspace before relying on it; the user's new request follows after this history.",
    coverage,
    retrievalLine(input),
  ].join("\n");
}

function frame(input: ContextHandoffTextInput, preamble: string, body: string) {
  return [
    `<cocurdex_context_handoff kind="${input.transferKind}" strategy="${input.strategy}">`,
    preamble,
    "",
    body,
    "</cocurdex_context_handoff>",
  ].join("\n");
}

export function buildContextHandoffText(input: ContextHandoffTextInput) {
  const total = input.items.length;
  const widestPreamble = preambleFor(input, coverageLine(total, total));
  const frameCost = handoffCost(frame(input, widestPreamble, ""));
  const { selected } = selectHandoffItems(
    input.items,
    Math.max(0, input.budget - frameCost),
  );
  const preamble = preambleFor(input, coverageLine(selected.length, total));
  const entries = selected.map((item) => ({
    role: item.role,
    text: renderHandoffItem(item),
  }));
  return {
    text: frame(
      input,
      preamble,
      entries.map((entry) => entry.text).join(ITEM_SEPARATOR),
    ),
    preamble,
    entries,
    selectedCount: selected.length,
    omittedCount: total - selected.length,
  };
}
