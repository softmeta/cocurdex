import type { AgentToolCallRecord } from "./contracts";

function asObjectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function getPositiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
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

const WINDOWS_DRIVE_PATH = /^[A-Za-z]:[\\/]/;

function isWindowsPath(path: string) {
  return WINDOWS_DRIVE_PATH.test(path) || path.startsWith("\\\\");
}

function trimTrailingSeparators(path: string) {
  let end = path.length;
  while (end > 0 && (path[end - 1] === "/" || path[end - 1] === "\\")) {
    end -= 1;
  }
  return path.slice(0, end);
}

function toComparablePath(path: string, windows: boolean) {
  const trimmed = trimTrailingSeparators(path.trim());
  return windows ? trimmed.replaceAll("\\", "/").toLowerCase() : trimmed;
}

export function getWorkspaceRelativePath(
  filePath: string,
  workspacePath: string | null,
): string | null {
  if (!workspacePath) {
    return null;
  }
  const windows = isWindowsPath(workspacePath);
  const root = toComparablePath(workspacePath, windows);
  const target = toComparablePath(filePath, windows);
  if (target === root) {
    return root ? "" : null;
  }
  if (!root || !target.startsWith(`${root}/`)) {
    return null;
  }
  const relative = filePath.trim().slice(root.length + 1);
  return windows ? relative.replaceAll("\\", "/") : relative;
}

export function getDisplayDirectory(
  filePath: string,
  workspacePath: string | null,
): string | null {
  const separatorIndex = Math.max(
    filePath.lastIndexOf("/"),
    filePath.lastIndexOf("\\"),
  );
  const directory = filePath.slice(0, Math.max(separatorIndex, 0));
  const relative = getWorkspaceRelativePath(directory, workspacePath);
  if (relative === null) {
    return directory || null;
  }
  return relative || null;
}

const LEADING_CD =
  /^cd\s+(?:\/d\s+)?(?:"([^"]+)"|'([^']+)'|([^\s;&|"']+))\s*&&\s*/i;

export function withoutWorkspaceCd(
  command: string,
  workspacePath: string | null,
) {
  const match = LEADING_CD.exec(command);
  const target = match?.[1] ?? match?.[2] ?? match?.[3];
  if (!match || !target || !workspacePath) {
    return command;
  }
  const rest = command.slice(match[0].length).trim();
  if (!rest || getWorkspaceRelativePath(target, workspacePath) !== "") {
    return command;
  }
  return rest;
}

export function truncateMiddle(value: string, maxLength = 120) {
  if (value.length <= maxLength) {
    return value;
  }

  const edgeLength = Math.floor((maxLength - 1) / 2);
  return `${value.slice(0, edgeLength)}…${value.slice(-edgeLength)}`;
}

export function sanitizeCommand(command: string) {
  return command.replace(/\s+/g, " ").trim();
}

export function unwrapShellCommand(command: string) {
  const normalized = sanitizeCommand(command);
  const shellMatch = normalized.match(
    /^(?:\/(?:usr\/)?bin\/)?(?:zsh|bash|sh)\s+-l?c\s+(["'])([\s\S]+)\1$/,
  );

  return shellMatch?.[2] ? sanitizeCommand(shellMatch[2]) : normalized;
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

export function getCommandPreview(command: string) {
  const unwrapped = unwrapShellCommand(command);
  const executable = getCommandExecutable(unwrapped);
  const target = getCommandPathTarget(unwrapped);

  if (!target || target === executable) {
    return truncateMiddle(unwrapped, 88);
  }

  return truncateMiddle(`${executable} ${target}`, 88);
}

export function getToolCallInputSummary(
  toolCall: Pick<AgentToolCallRecord, "rawInput">,
  workspacePath: string | null = null,
) {
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
    return truncateMiddle(
      withoutWorkspaceCd(unwrapShellCommand(command), workspacePath),
    );
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
    const displayPath = getWorkspaceRelativePath(path, workspacePath) || path;
    const startLine =
      getPositiveNumber(inputRecord.offset) ??
      getPositiveNumber(inputRecord.line) ??
      null;
    const limit = getPositiveNumber(inputRecord.limit);
    const endLine =
      startLine && limit ? Math.max(startLine, startLine + limit - 1) : null;
    const rangeLabel = getLineRangeLabel(startLine, endLine);

    return truncateMiddle(
      rangeLabel ? `${displayPath} ${rangeLabel}` : displayPath,
    );
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
