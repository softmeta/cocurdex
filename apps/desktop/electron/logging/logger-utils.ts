import type {
  DesktopLogDetails,
  DesktopLogLevel,
  RendererLogPayload,
} from "@cocurdex/shared";

const SENSITIVE_KEY_PATTERNS = [
  "apikey",
  "api_key",
  "authorization",
  "content",
  "delta",
  "password",
  "rawinput",
  "rawoutput",
  "secret",
  "selectedtext",
  "surroundingcontext",
  "token",
];
const MAX_STRING_LENGTH = 500;
const MAX_DEPTH = 5;
const REDACTED = "[redacted]";

export const desktopLogLevels = ["debug", "info", "warn", "error"] as const;

export function formatReadableLogLine(entry: {
  details?: DesktopLogDetails;
  event: string;
  level: DesktopLogLevel;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isDesktopLogLevel(value: unknown): value is DesktopLogLevel {
  return (
    typeof value === "string" &&
    desktopLogLevels.includes(value as DesktopLogLevel)
  );
}

function normalizeKey(key: string) {
  return key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function shouldRedactKey(key: string) {
  const normalizedKey = normalizeKey(key);
  return SENSITIVE_KEY_PATTERNS.some((pattern) =>
    normalizedKey.includes(pattern),
  );
}

function redactSensitiveText(value: string) {
  return value
    .replace(/(authorization:\s*bearer\s+)[^\s]+/gi, "$1[redacted]")
    .replace(/([?&](?:api_key|token|key|secret)=)[^&\s]+/gi, "$1[redacted]");
}

function truncateString(value: string) {
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
    return truncateString(value);
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
        typeof error === "string" ? truncateString(error) : "Unknown error",
    };
  }

  return {
    message: truncateString(error.message),
    name: error.name,
    stack: error.stack ? truncateString(error.stack) : undefined,
  };
}

export function sanitizeRendererLogPayload(
  payload: unknown,
): RendererLogPayload {
  if (!isRecord(payload)) {
    return {
      event: "renderer.invalidPayload",
      level: "warn",
      scope: "renderer",
    };
  }

  const level = isDesktopLogLevel(payload.level) ? payload.level : "error";
  const scope =
    typeof payload.scope === "string" && payload.scope.trim()
      ? truncateString(payload.scope)
      : "renderer";
  const event =
    typeof payload.event === "string" && payload.event.trim()
      ? truncateString(payload.event)
      : "renderer.error";

  return {
    details: sanitizeLogDetails(
      payload.details,
    ) as RendererLogPayload["details"],
    event,
    level,
    scope,
  };
}
