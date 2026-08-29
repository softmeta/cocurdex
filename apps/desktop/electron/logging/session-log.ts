import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import path from "node:path";
import { buildSessionLogFileName } from "./log-paths";
import { pruneLogFiles } from "./log-retention";

export interface SessionLogConfig {
  directory: string;
  retentionDays: number;
  maxFiles: number;
  // Streams are closed after this idle period to bound open file descriptors
  // when many sessions log over a long-running app instance.
  idleTimeoutMs: number;
}

interface OpenSessionLog {
  filePath: string;
  stream: WriteStream;
  idleTimer: NodeJS.Timeout | null;
}

let config: SessionLogConfig | null = null;
// Stable file path per session for the app run, kept even after the stream is
// idle-closed so later writes append to the same file instead of forking a new
// timestamped one.
const sessionPaths = new Map<string, string>();
const openLogs = new Map<string, OpenSessionLog>();

export function configureSessionLogs(next: SessionLogConfig): void {
  config = next;
  mkdirSync(next.directory, { recursive: true });
}

export async function pruneSessionLogs(now = Date.now()): Promise<string[]> {
  if (!config) {
    return [];
  }
  return pruneLogFiles(config.directory, {
    retentionDays: config.retentionDays,
    maxFiles: config.maxFiles,
    now,
  });
}

function resolveSessionPath(activeConfig: SessionLogConfig, sessionId: string) {
  const existing = sessionPaths.get(sessionId);
  if (existing) {
    return existing;
  }
  const filePath = path.join(
    activeConfig.directory,
    buildSessionLogFileName(sessionId, new Date()),
  );
  sessionPaths.set(sessionId, filePath);
  return filePath;
}

function openStream(activeConfig: SessionLogConfig, sessionId: string) {
  const existing = openLogs.get(sessionId);
  if (existing) {
    return existing;
  }
  const filePath = resolveSessionPath(activeConfig, sessionId);
  const stream = createWriteStream(filePath, { flags: "a" });
  const entry: OpenSessionLog = { filePath, stream, idleTimer: null };
  openLogs.set(sessionId, entry);
  return entry;
}

function scheduleIdleClose(
  activeConfig: SessionLogConfig,
  sessionId: string,
  entry: OpenSessionLog,
) {
  if (entry.idleTimer) {
    clearTimeout(entry.idleTimer);
  }
  entry.idleTimer = setTimeout(() => {
    closeSessionLog(sessionId);
  }, activeConfig.idleTimeoutMs);
  // Do not keep the process alive solely for an idle log stream.
  entry.idleTimer.unref?.();
}

export function writeSessionLog(sessionId: string, line: string): void {
  if (!config) {
    return;
  }
  const entry = openStream(config, sessionId);
  entry.stream.write(`${line}\n`);
  scheduleIdleClose(config, sessionId, entry);
}

export function closeSessionLog(sessionId: string): void {
  const entry = openLogs.get(sessionId);
  if (!entry) {
    return;
  }
  if (entry.idleTimer) {
    clearTimeout(entry.idleTimer);
  }
  entry.stream.end();
  openLogs.delete(sessionId);
}

export async function closeAllSessionLogs(): Promise<void> {
  for (const sessionId of [...openLogs.keys()]) {
    closeSessionLog(sessionId);
  }
}
