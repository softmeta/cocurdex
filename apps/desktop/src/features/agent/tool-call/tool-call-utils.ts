import type {
  AgentToolCallContent,
  AgentToolCallRecord,
} from "@cocurdex/shared";
import { i18n } from "@/i18n";

// Lives here (not in tool-call-ui) so the util layer stays a leaf: the UI
// imports utils, never the other way around.
export type ToolCallPreviewLocation = {
  filePath: string;
  startLine?: number | null;
  endLine?: number | null;
  title?: string | null;
};

export function formatToolCallData(data: unknown) {
  if (data === undefined || data === null) {
    return null;
  }

  if (typeof data === "string") {
    return data;
  }

  const textContent = extractTextContent(data);
  if (textContent !== null) {
    return textContent;
  }

  return JSON.stringify(data, null, 2);
}

export function formatToolCallOutput(
  content: AgentToolCallContent[] | undefined,
  rawOutput: unknown,
) {
  const text = content?.flatMap((item) => {
    if (item.type === "text") {
      return [item.text];
    }

    if (item.type === "diff") {
      return [
        [item.oldText, item.newText]
          .filter((value): value is string => typeof value === "string")
          .join("\n"),
      ];
    }

    if (item.type === "data") {
      const formatted = formatToolCallData(item.value);
      return formatted ? [formatted] : [];
    }

    return [];
  });

  return text?.join("\n") || formatToolCallData(rawOutput);
}

function asObjectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function extractTextContent(data: unknown) {
  const dataRecord = asObjectRecord(data);
  if (!Array.isArray(dataRecord?.content)) {
    return null;
  }

  const textBlocks = dataRecord.content.flatMap((block) => {
    const blockRecord = asObjectRecord(block);
    return blockRecord?.type === "text" && typeof blockRecord.text === "string"
      ? [blockRecord.text]
      : [];
  });

  return textBlocks.length > 0 ? textBlocks.join("") : null;
}

export function getSubagentChildSessionId(toolCall: AgentToolCallRecord) {
  return toolCall.subagent?.sessionId || null;
}

export function isSubagentToolCall(toolCall: AgentToolCallRecord) {
  return Boolean(toolCall.subagent?.sessionId);
}

export function partitionToolCallRuns(toolCalls: AgentToolCallRecord[]) {
  const runs: Array<{
    kind: "subagent" | "tool";
    toolCalls: AgentToolCallRecord[];
  }> = [];

  for (const toolCall of toolCalls) {
    const kind = isSubagentToolCall(toolCall) ? "subagent" : "tool";
    const last = runs.at(-1);

    if (last?.kind === kind) {
      last.toolCalls.push(toolCall);
      continue;
    }

    runs.push({ kind, toolCalls: [toolCall] });
  }

  return runs;
}

export function getSubagentType(toolCall: AgentToolCallRecord) {
  const value = toolCall.subagent?.type;

  if (!value) {
    return null;
  }

  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getSubagentDescription(toolCall: AgentToolCallRecord) {
  const description = toolCall.subagent?.description.trim() ?? "";

  return description || getToolCallTitle(toolCall);
}

function getPositiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function getFileLabel(filePath: string) {
  return filePath.split("/").pop() ?? filePath;
}

export function getLineRangeLabel(
  startLine?: number | null,
  endLine?: number | null,
) {
  if (!startLine && !endLine) {
    return null;
  }

  if (startLine && endLine && startLine !== endLine) {
    return `L${startLine}-${endLine}`;
  }

  return `L${startLine ?? endLine}`;
}

export function getToolPreviewTitle(location: ToolCallPreviewLocation) {
  const rangeLabel = getLineRangeLabel(location.startLine, location.endLine);
  return i18n.t("agent:toolCalls.readFile", {
    fileName: getFileLabel(location.filePath),
    range: rangeLabel ? ` ${rangeLabel}` : "",
  });
}

export function getToolCallPreviewLocations(
  toolCall: AgentToolCallRecord,
): ToolCallPreviewLocation[] {
  if (toolCall.kind !== "read") {
    return [];
  }

  const rawInput = asObjectRecord(toolCall.rawInput);
  const rawPath = typeof rawInput?.path === "string" ? rawInput.path : null;
  const startLine =
    getPositiveNumber(rawInput?.offset) ?? toolCall.locations[0]?.line ?? null;
  const limit = getPositiveNumber(rawInput?.limit);
  const endLine =
    startLine && limit ? Math.max(startLine, startLine + limit - 1) : null;

  if (rawPath) {
    return [
      {
        filePath: rawPath,
        startLine,
        endLine,
        title: getToolPreviewTitle({
          filePath: rawPath,
          startLine,
          endLine,
        }),
      },
    ];
  }

  return toolCall.locations.map((location) => {
    const previewLocation = {
      filePath: location.path,
      startLine: location.line ?? null,
      endLine: location.line ?? null,
    } satisfies ToolCallPreviewLocation;

    return {
      ...previewLocation,
      title: getToolPreviewTitle(previewLocation),
    };
  });
}

export function getToolCallStatusLabel(toolCall: AgentToolCallRecord) {
  if (toolCall.status === "completed") {
    return i18n.t("agent:toolCalls.completed");
  }

  if (toolCall.status === "failed") {
    return i18n.t("agent:toolCalls.failed");
  }

  if (toolCall.status === "pending") {
    return i18n.t("agent:toolCalls.pending");
  }

  return i18n.t("agent:toolCalls.running");
}

export function getToolCallStatusClasses(toolCall: AgentToolCallRecord) {
  if (toolCall.status === "completed") {
    return "text-chat-status-completed-fg";
  }

  if (toolCall.status === "failed") {
    return "text-chat-status-failed-fg";
  }

  if (toolCall.status === "pending") {
    return "text-chat-status-pending-fg";
  }

  return "text-chat-status-running-fg";
}

// Second precision. Activity runs are bursts of calls seconds apart, so minute
// precision rounded a 40-second run into a misleadingly wide "12:40 – 12:41"
// range; seconds keep the endpoints honest.
function formatToolTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
}

function truncateMiddle(value: string, maxLength = 120) {
  if (value.length <= maxLength) {
    return value;
  }

  const edgeLength = Math.floor((maxLength - 1) / 2);
  return `${value.slice(0, edgeLength)}…${value.slice(-edgeLength)}`;
}

function sanitizeCommand(command: string) {
  return command.replace(/\s+/g, " ").trim();
}

function unwrapShellCommand(command: string) {
  const normalized = sanitizeCommand(command);
  const shellMatch = normalized.match(
    /^\/bin\/(?:zsh|bash|sh)\s+-lc\s+["']([\s\S]+)["']$/,
  );

  return shellMatch?.[1] ? sanitizeCommand(shellMatch[1]) : normalized;
}

function getCommandExecutable(command: string) {
  const match = command.match(/^([^\s]+)/);
  return match?.[1] ?? command;
}

function getCommandPathTarget(command: string) {
  const tokens = command.match(/'[^']*'|"[^"]*"|\S+/g) ?? [];

  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index]?.replace(/^['"]|['"]$/g, "");
    if (!token || token.startsWith("-")) {
      continue;
    }

    if (token.includes("/") || token.includes(".")) {
      return token;
    }
  }

  return null;
}

function getCommandPreview(command: string) {
  const unwrapped = unwrapShellCommand(command);
  const executable = getCommandExecutable(unwrapped);
  const target = getCommandPathTarget(unwrapped);

  if (!target || target === executable) {
    return truncateMiddle(unwrapped, 88);
  }

  return truncateMiddle(`${executable} ${target}`, 88);
}

function getToolCallInputSummary(toolCall: AgentToolCallRecord) {
  const rawInput = toolCall.rawInput;

  if (typeof rawInput === "string") {
    return truncateMiddle(sanitizeCommand(rawInput));
  }

  const rawInputRecord = asObjectRecord(rawInput);
  if (!rawInputRecord) {
    return null;
  }
  const inputRecord = asObjectRecord(rawInputRecord.input) ?? rawInputRecord;

  const command =
    typeof inputRecord.command === "string"
      ? inputRecord.command
      : typeof inputRecord.cmd === "string"
        ? inputRecord.cmd
        : null;

  if (command) {
    return truncateMiddle(unwrapShellCommand(command));
  }

  const path =
    typeof inputRecord.path === "string"
      ? inputRecord.path
      : typeof inputRecord.filePath === "string"
        ? inputRecord.filePath
        : typeof inputRecord.file_path === "string"
          ? inputRecord.file_path
          : null;
  const query =
    typeof inputRecord.query === "string"
      ? inputRecord.query
      : typeof inputRecord.pattern === "string"
        ? inputRecord.pattern
        : null;

  if (path && query) {
    return truncateMiddle(`${query} in ${path}`);
  }

  if (path) {
    const startLine =
      getPositiveNumber(inputRecord.offset) ??
      getPositiveNumber(inputRecord.line) ??
      null;
    const limit = getPositiveNumber(inputRecord.limit);
    const endLine =
      startLine && limit ? Math.max(startLine, startLine + limit - 1) : null;
    const rangeLabel = getLineRangeLabel(startLine, endLine);

    return truncateMiddle(rangeLabel ? `${path} ${rangeLabel}` : path);
  }

  if (query) {
    return truncateMiddle(query);
  }

  const description =
    typeof inputRecord.description === "string"
      ? inputRecord.description
      : null;

  return description ? truncateMiddle(description) : null;
}

export function getToolCallSummary(toolCall: AgentToolCallRecord) {
  const parts = [getToolCallTitle(toolCall)];
  const inputSummary = getToolCallInputSummary(toolCall);

  if (inputSummary) {
    parts.push(inputSummary);
  } else if (toolCall.kind && toolCall.kind !== toolCall.title) {
    parts.push(toolCall.kind);
  }

  if (toolCall.locations.length > 0) {
    parts.push(
      i18n.t("agent:toolCalls.files", { count: toolCall.locations.length }),
    );
  }

  return parts.join(" · ");
}

export function getToolCallSecondarySummary(toolCall: AgentToolCallRecord) {
  const title = getToolCallTitle(toolCall);
  const summary = getToolCallSummary(toolCall);

  if (summary === title) {
    return null;
  }

  return summary.startsWith(`${title} · `)
    ? summary.slice(title.length + 3)
    : summary;
}

export function getToolCallTriggerParts(toolCall: AgentToolCallRecord) {
  const title = getToolCallTitle(toolCall);
  const isCommand =
    ["exec", "execute", "run_terminal_command"].includes(toolCall.kind ?? "") ||
    /^(execute|run)\b/i.test(title);

  if (isCommand) {
    const titleCommand = title.replace(/^(execute|run)\s*/i, "").trim();
    return {
      title: i18n.t("agent:toolCalls.execute"),
      secondary:
        getToolCallInputSummary(toolCall) ||
        truncateMiddle(sanitizeCommand(titleCommand || title)),
    };
  }

  return {
    title,
    secondary: getToolCallSecondarySummary(toolCall),
  };
}

export function getToolCallTitle(toolCall: AgentToolCallRecord) {
  if (isSubagentToolCall(toolCall)) {
    if (toolCall.status === "completed") {
      return i18n.t("agent:toolCalls.subagentCompleted");
    }

    if (toolCall.status === "failed") {
      return i18n.t("agent:toolCalls.subagentFailed");
    }

    return i18n.t("agent:toolCalls.subagent");
  }

  if (toolCall.kind === "exec") {
    const rawInput = asObjectRecord(toolCall.rawInput);
    const command =
      typeof rawInput?.command === "string"
        ? rawInput.command
        : typeof rawInput?.cmd === "string"
          ? rawInput.cmd
          : toolCall.title;

    return getCommandPreview(command);
  }

  return toolCall.title;
}

export type ToolCallInputEntry = {
  key: string;
  label: string;
  value: string;
  mono: boolean;
};

// Field names that should render in mono — paths, URLs, commands, patterns.
// Both snake_case and camelCase variants are included to cover every Claude
// Code tool: Bash/Read/Write/Edit/Glob/Grep/WebFetch/NotebookEdit/
// ReadMcpResource/etc.
const MONO_FIELD_KEYS = new Set([
  "cell_id",
  "cellId",
  "cmd",
  "command",
  "file_path",
  "filePath",
  "filepath",
  "glob",
  "notebook_path",
  "notebookPath",
  "path",
  "pattern",
  "regex",
  "shell_id",
  "shellId",
  "task_id",
  "taskId",
  "uri",
  "url",
]);

// Long-form or code-like fields that should render full-width below the label
// instead of inline next to it. Covers Write/Edit/NotebookEdit/WebFetch/Agent
// payloads, shell commands (which read as a code line, not a key/value pair),
// and any value that already contains a newline.
const MULTILINE_FIELD_KEYS = new Set([
  "cmd",
  "command",
  "content",
  "new_source",
  "newSource",
  "new_string",
  "newString",
  "old_string",
  "oldString",
  "prompt",
]);

// Render an array of TodoWrite items as a compact checklist. Returns null when
// the value does not match the expected `{ content, status }` shape.
function formatTodosArray(value: unknown[]): string | null {
  if (value.length === 0) {
    return null;
  }
  const lines: string[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return null;
    }
    const todo = item as Record<string, unknown>;
    const content = typeof todo.content === "string" ? todo.content : null;
    const status = typeof todo.status === "string" ? todo.status : "pending";
    if (!content) {
      return null;
    }
    const marker =
      status === "completed" ? "[x]" : status === "in_progress" ? "[~]" : "[ ]";
    lines.push(`${marker} ${content}`);
  }
  return lines.join("\n");
}

function humanizeKey(key: string) {
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  if (!spaced) {
    return key;
  }
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

function stringifyEntryValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    // TodoWrite: render as a checklist when items match the expected shape.
    const todos = formatTodosArray(value);
    if (todos) {
      return todos;
    }
    // WebSearch.allowed_domains / blocked_domains and similar plain string
    // arrays: render comma-separated for readability.
    if (value.every((item) => typeof item === "string")) {
      return (value as string[]).join(", ");
    }
  }
  return JSON.stringify(value, null, 2);
}

function looksLikePathOrUrl(value: string) {
  return /^(\/|\.\.?\/|https?:\/\/|[a-zA-Z]:\\)/.test(value);
}

export function getToolCallInputEntries(
  toolCall: AgentToolCallRecord,
): ToolCallInputEntry[] | null {
  const record = asObjectRecord(toolCall.rawInput);
  if (!record) {
    return null;
  }

  const entries = Object.entries(record).filter(([, value]) => {
    if (value === undefined || value === "") {
      return false;
    }
    if (Array.isArray(value) && value.length === 0) {
      return false;
    }
    return true;
  });
  if (entries.length === 0) {
    return null;
  }

  return entries.map(([key, value]) => {
    const valueString = stringifyEntryValue(value);
    const mono =
      MONO_FIELD_KEYS.has(key) ||
      (typeof value === "string" && looksLikePathOrUrl(value));
    return {
      key,
      label: humanizeKey(key),
      value: valueString,
      mono,
    };
  });
}

export function isMultilineInputField(entry: ToolCallInputEntry) {
  return MULTILINE_FIELD_KEYS.has(entry.key) || entry.value.includes("\n");
}

export function getToolCallDetailLabel(toolCall: AgentToolCallRecord) {
  if (toolCall.kind === "exec") {
    return i18n.t("agent:toolCalls.command");
  }

  return i18n.t("agent:toolCalls.input");
}

export function getToolCallGroupCountLabel(toolCalls: AgentToolCallRecord[]) {
  return i18n.t("agent:toolCalls.count", { count: toolCalls.length });
}

export function getToolCallTimestamp(toolCall: AgentToolCallRecord) {
  return formatToolTime(toolCall.updatedAt);
}
