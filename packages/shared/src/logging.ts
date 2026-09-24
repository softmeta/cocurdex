export type DesktopLogLevel = "debug" | "info" | "warn" | "error";

export const COCURDEX_DAEMON_DIAGNOSTIC_PREFIX = "[CocurdexDaemonDiagnostic] ";

export type DesktopLogDetails =
  | Record<string, unknown>
  | unknown[]
  | string
  | number
  | boolean
  | null
  | undefined;

export interface RendererLogPayload {
  level: DesktopLogLevel;
  scope: string;
  event: string;
  details?: DesktopLogDetails;
}

export interface DiagnosticsExportResult {
  outputPath: string;
  fileCount: number;
}

export function hashLogValue(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0").slice(0, 12);
}

export type LogErrorKind =
  | "aborted"
  | "auth"
  | "network"
  | "notFound"
  | "parse"
  | "permission"
  | "rateLimited"
  | "timeout"
  | "unknown";

export function errorKindForLog(error: unknown): LogErrorKind {
  if (error instanceof Error && error.name === "AbortError") {
    return "aborted";
  }
  const message = error instanceof Error ? error.message : String(error);
  const checks: [LogErrorKind, RegExp][] = [
    ["aborted", /\babort(?:ed|ing|s)?\b/i],
    ["timeout", /timed?\s*out|ETIMEDOUT|deadline exceeded/i],
    ["auth", /\b(?:401|403)\b|unauthori[sz]ed|forbidden|invalid api.?key/i],
    ["rateLimited", /\b429\b|rate.?limit|too many requests/i],
    [
      "network",
      /ENOTFOUND|ECONNREFUSED|ECONNRESET|ECONNABORTED|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|fetch failed|socket hang up|network ?error|DNS/i,
    ],
    ["notFound", /ENOENT|no such file|not found/i],
    ["permission", /EACCES|EPERM|permission denied/i],
    ["parse", /JSON\.parse|SyntaxError|unexpected token|parse error/i],
  ];
  for (const [kind, pattern] of checks) {
    if (pattern.test(message)) {
      return kind;
    }
  }
  return "unknown";
}

export function hostForLog(url: string | null | undefined) {
  if (!url) {
    return null;
  }
  const authority = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/([^/?#]*)/.exec(
    url.trim(),
  )?.[1];
  if (authority === undefined) {
    return "[unparsable-url]";
  }
  return authority.slice(authority.lastIndexOf("@") + 1) || null;
}
