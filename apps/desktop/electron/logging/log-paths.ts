import path from "node:path";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SESSION_ID_LENGTH = 64;

// ISO timestamps contain `:` and `.`, neither of which is portable across
// Windows/macOS file systems, so normalize them into dashes for file names.
export function sanitizeTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function sanitizeSessionId(sessionId: string): string {
  return sessionId
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, MAX_SESSION_ID_LENGTH);
}

export function buildSessionLogFileName(sessionId: string, date: Date): string {
  return `${sanitizeTimestamp(date)}-${sanitizeSessionId(sessionId)}.log`;
}

// `main.log` -> `main-2026-06-10T08-09-10-123Z.log`
export function buildArchiveLogFileName(baseName: string, date: Date): string {
  const ext = path.extname(baseName);
  const stem = ext ? baseName.slice(0, -ext.length) : baseName;
  return `${stem}-${sanitizeTimestamp(date)}${ext}`;
}

// Retention is day-based and primary. A non-positive window disables expiry so
// callers can opt out without special-casing the prune logic.
export function isExpired(
  mtimeMs: number,
  nowMs: number,
  retentionDays: number,
): boolean {
  if (retentionDays <= 0) {
    return false;
  }
  return nowMs - mtimeMs > retentionDays * DAY_MS;
}
