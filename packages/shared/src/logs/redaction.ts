import os from "node:os";
import type { LogDetails, LogLevel } from "../logging";

const SENSITIVE_KEY_PATTERNS = [
  "apikey",
  "api_key",
  "authorization",
  "body",
  "command",
  "content",
  "cookie",
  "credential",
  "cwd",
  "delta",
  "email",
  "env",
  "filename",
  "filepath",
  "folder",
  "header",
  "password",
  "prompt",
  "rawinput",
  "rawoutput",
  "rootpath",
  "secret",
  "selectedtext",
  "snippet",
  "stderr",
  "stdin",
  "stdout",
  "surroundingcontext",
  "title",
  "token",
  "transcript",
  "url",
  "username",
  "workspaceroot",
];
const METADATA_KEY_SUFFIXES =
  /(?:Length|Count|Hash|Bytes|Size|DurationMs|Chars|Lines|Depth|Width|Height)$/;
const MAX_STRING_LENGTH = 500;
const MAX_DEPTH = 5;
const REDACTED = "[redacted]";

export function formatReadableLogLine(entry: {
  details?: LogDetails;
  event: string;
  level: LogLevel;
  scope: string;
  timestamp: string;
}) {
  const serializedDetails = JSON.stringify(entry.details);
  const details =
    serializedDetails === undefined ? "" : ` ${serializedDetails}`;
  const level = entry.level.toUpperCase().padEnd(5);
  const scope = entry.scope || "app";
  const timestamp = entry.timestamp.replace("T", " ");

  return `${timestamp} ${level} [${scope}] ${entry.event}${details}`;
}

function normalizeKey(key: string) {
  return key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function shouldRedactKey(key: string) {
  if (METADATA_KEY_SUFFIXES.test(key)) {
    return false;
  }
  const normalizedKey = normalizeKey(key);
  return SENSITIVE_KEY_PATTERNS.some((pattern) =>
    normalizedKey.includes(pattern),
  );
}

const SENSITIVE_TEXT_REPLACEMENTS: [RegExp, string][] = [
  [/(authorization:\s*bearer\s+)[^\s]+/gi, `$1${REDACTED}`],
  [/([?&](?:api_key|token|key|secret)=)[^&\s]+/gi, `$1${REDACTED}`],
  [/(\w[\w+.-]*:\/\/)[^\s/@]+@/g, `$1${REDACTED}@`],
  [/\/(?:Users|home)\/[^/\s"'\\:]+/g, "~"],
  [/[A-Za-z]:\\+Users\\+[^\\\s"']+/g, "~"],
  [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    REDACTED,
  ],
  [
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    REDACTED,
  ],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, REDACTED],
  [/\bAIza[0-9A-Za-z_-]{35}\b/g, REDACTED],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, REDACTED],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, REDACTED],
  [/\bglpat-[A-Za-z0-9_-]{20,}\b/g, REDACTED],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, REDACTED],
  [/\bsk-[A-Za-z0-9_-]{16,}\b/g, REDACTED],
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function trimTrailingSeparators(value: string) {
  let end = value.length;
  while (end > 0 && (value[end - 1] === "/" || value[end - 1] === "\\")) {
    end -= 1;
  }
  return value.slice(0, end);
}

function homeDirectoryPatterns(homeDir: string) {
  const trimmed = trimTrailingSeparators(homeDir.trim());
  if (trimmed.length < 2) {
    return [];
  }
  const variants = new Set([
    trimmed,
    trimmed.replace(/\\/g, "/"),
    trimmed.replace(/\\/g, "\\\\"),
  ]);
  return [...variants].map(
    (variant) => new RegExp(escapeRegExp(variant), "gi"),
  );
}

export function redactSensitiveText(value: string, homeDir = os.homedir()) {
  let result = value;
  for (const pattern of homeDirectoryPatterns(homeDir)) {
    result = result.replace(pattern, "~");
  }
  for (const [pattern, replacement] of SENSITIVE_TEXT_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export function truncateLogString(value: string) {
  const redacted = redactSensitiveText(value);
  return redacted.length > MAX_STRING_LENGTH
    ? `${redacted.slice(0, MAX_STRING_LENGTH)}...`
    : redacted;
}

export function sanitizeLogDetails(
  value: unknown,
  key = "",
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (key && shouldRedactKey(key)) {
    return REDACTED;
  }

  if (value instanceof Error) {
    return formatErrorForLog(value);
  }

  if (typeof value === "string") {
    return truncateLogString(value);
  }

  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "undefined") {
    return undefined;
  }

  if (typeof value === "function" || typeof value === "symbol") {
    return `[${typeof value}]`;
  }

  if (depth >= MAX_DEPTH) {
    return "[max-depth]";
  }

  if (!value || typeof value !== "object") {
    return String(value);
  }

  if (seen.has(value)) {
    return "[circular]";
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogDetails(item, key, depth + 1, seen));
  }

  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      sanitizeLogDetails(entryValue, entryKey, depth + 1, seen),
    ]),
  );
}

export function formatErrorForLog(error: unknown) {
  if (!(error instanceof Error)) {
    return {
      message:
        typeof error === "string" ? truncateLogString(error) : "Unknown error",
    };
  }

  return {
    message: truncateLogString(error.message),
    name: error.name,
    stack: error.stack ? truncateLogString(error.stack) : undefined,
  };
}
