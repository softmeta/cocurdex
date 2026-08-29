import { renameSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  DesktopLogDetails,
  DesktopLogLevel,
  DiagnosticsExportResult,
  RendererLogPayload,
} from "@cocurdex/shared";
import log from "electron-log/main.js";
import { buildArchiveLogFileName } from "./log-paths";
import { pruneLogFiles } from "./log-retention";
import {
  formatErrorForLog,
  formatReadableLogLine,
  sanitizeLogDetails,
  sanitizeRendererLogPayload,
} from "./logger-utils";
import {
  closeAllSessionLogs,
  configureSessionLogs,
  pruneSessionLogs,
  writeSessionLog,
} from "./session-log";

const LOG_FILE_NAME = "main.log";
const FILE_TRANSPORT_MAX_SIZE = 5 * 1024 * 1024;
const DEFAULT_RETENTION_DAYS = 7;
// Secondary bound on per-session files; day-based retention stays primary.
const SESSION_LOG_MAX_FILES = 200;
const SESSION_LOG_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

let logDirectory = "";
let sessionLogDirectory = "";
let diagnosticsDirectory = "";
let appVersion = "unknown";
let retentionDays = DEFAULT_RETENTION_DAYS;
let consoleInstalled = false;

const originalConsole = {
  debug: console.debug.bind(console),
  error: console.error.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
};

export interface ScopedLogger {
  debug(event: string, details?: DesktopLogDetails): void;
  error(event: string, details?: DesktopLogDetails): void;
  info(event: string, details?: DesktopLogDetails): void;
  warn(event: string, details?: DesktopLogDetails): void;
}

function normalizeLogLevel(level: DesktopLogLevel) {
  return level === "debug" ? "debug" : level;
}

function serializeLogEntry(
  level: DesktopLogLevel,
  scope: string,
  event: string,
  details?: DesktopLogDetails,
  source = "main",
) {
  return {
    appVersion,
    details: sanitizeLogDetails(details),
    event,
    level,
    pid: process.pid,
    processType: process.type,
    scope,
    source,
  };
}

function buildLogLine(
  entry: ReturnType<typeof serializeLogEntry>,
  timestamp: string,
) {
  return JSON.stringify({
    timestamp,
    ...entry,
    level: entry.level,
    scope: entry.scope || "app",
  });
}

function extractSessionId(
  details: ReturnType<typeof sanitizeLogDetails>,
): string | undefined {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return undefined;
  }
  const sessionId = (details as Record<string, unknown>).sessionId;
  return typeof sessionId === "string" && sessionId.trim()
    ? sessionId
    : undefined;
}

function writeLog(
  level: DesktopLogLevel,
  scope: string,
  event: string,
  details?: DesktopLogDetails,
  source = "main",
) {
  const logger = scope ? log.scope(scope) : log;
  const normalizedLevel = normalizeLogLevel(level);
  const entry = serializeLogEntry(level, scope, event, details, source);

  logger[normalizedLevel](entry);

  // Fan events that carry a sessionId out to a dedicated per-session file so a
  // single agent run can be inspected or shared without the shared main.log.
  const sessionId = extractSessionId(entry.details);
  if (sessionId) {
    writeSessionLog(sessionId, buildLogLine(entry, new Date().toISOString()));
  }
}

function consoleArgsToDetails(args: unknown[]) {
  const [firstArg, ...restArgs] = args;

  return {
    args: sanitizeLogDetails(restArgs),
    message:
      typeof firstArg === "string"
        ? firstArg
        : sanitizeLogDetails(firstArg, "payload"),
  };
}

function installConsoleCapture() {
  if (consoleInstalled) {
    return;
  }

  consoleInstalled = true;

  console.debug = (...args: unknown[]) => {
    originalConsole.debug(...args);
    writeLog("debug", "console", "console.debug", consoleArgsToDetails(args));
  };
  console.info = (...args: unknown[]) => {
    originalConsole.info(...args);
    writeLog("info", "console", "console.info", consoleArgsToDetails(args));
  };
  console.warn = (...args: unknown[]) => {
    originalConsole.warn(...args);
    writeLog("warn", "console", "console.warn", consoleArgsToDetails(args));
  };
  console.error = (...args: unknown[]) => {
    originalConsole.error(...args);
    writeLog("error", "console", "console.error", consoleArgsToDetails(args));
  };
}

async function copyLogsFromDirectory(
  sourceDirectory: string,
  targetDirectory: string,
) {
  let entries: import("node:fs").Dirent<string>[];
  try {
    entries = await fs.readdir(sourceDirectory, {
      withFileTypes: true,
      encoding: "utf8",
    });
  } catch {
    return [];
  }

  const copiedFiles: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".log")) {
      continue;
    }

    const sourcePath = path.join(sourceDirectory, entry.name);
    const targetPath = path.join(targetDirectory, entry.name);
    await fs.copyFile(sourcePath, targetPath);
    copiedFiles.push(targetPath);
  }

  return copiedFiles;
}

async function copyLogFiles(targetDirectory: string) {
  if (!logDirectory) {
    return [];
  }

  const copiedFiles = await copyLogsFromDirectory(
    logDirectory,
    targetDirectory,
  );

  // Bundle per-session logs under a nested folder so a diagnostics export keeps
  // the same on-disk layout as the live logs directory.
  if (sessionLogDirectory) {
    const sessionsTarget = path.join(targetDirectory, "sessions");
    await fs.mkdir(sessionsTarget, { recursive: true });
    const sessionFiles = await copyLogsFromDirectory(
      sessionLogDirectory,
      sessionsTarget,
    );
    copiedFiles.push(...sessionFiles);
  }

  return copiedFiles;
}

function archiveMainLog(oldLogFilePath: string) {
  try {
    const directory = path.dirname(oldLogFilePath);
    const archivePath = path.join(
      directory,
      buildArchiveLogFileName(path.basename(oldLogFilePath), new Date()),
    );
    renameSync(oldLogFilePath, archivePath);
  } catch (error) {
    originalConsole.error("logging.archiveFailed", error);
  }
  // Drop archives that have aged out of the retention window.
  void pruneLogFiles(logDirectory, {
    retentionDays,
    match: (name) => name.startsWith("main-") && name.endsWith(".log"),
  });
}

export function configureLogging(paths: {
  appVersion: string;
  diagnosticsDirectory: string;
  logDirectory: string;
  sessionLogDirectory: string;
  // Human-readable main log output is only for local development. Packaged
  // logs stay JSONL so diagnostics tooling can parse them consistently.
  pretty?: boolean;
  // Verbose (debug) file logging in dev or when diagnostics are explicitly
  // requested; production builds default to info to bound size and exposure.
  verbose: boolean;
  retentionDays?: number;
}) {
  appVersion = paths.appVersion;
  logDirectory = paths.logDirectory;
  sessionLogDirectory = paths.sessionLogDirectory;
  diagnosticsDirectory = paths.diagnosticsDirectory;
  retentionDays = paths.retentionDays ?? DEFAULT_RETENTION_DAYS;

  log.transports.file.fileName = LOG_FILE_NAME;
  log.transports.file.level = paths.verbose ? "debug" : "info";
  log.transports.file.maxSize = FILE_TRANSPORT_MAX_SIZE;
  log.transports.file.format = paths.pretty
    ? ({ data, message }) => {
        const entry = data[0] as ReturnType<typeof serializeLogEntry>;
        return [
          formatReadableLogLine({
            ...entry,
            details: entry.details as DesktopLogDetails,
            timestamp: message.date.toISOString(),
          }),
        ];
      }
    : ({ data, level, message }) => {
        const entry = data[0] as Record<string, unknown> | undefined;

        return [
          JSON.stringify({
            timestamp: message.date.toISOString(),
            ...(entry ?? {}),
            level,
            scope: message.scope ?? entry?.scope ?? "app",
          }),
        ];
      };
  log.transports.file.resolvePathFn = () =>
    path.join(logDirectory, LOG_FILE_NAME);
  log.transports.file.archiveLogFn = (oldLogFile) => {
    archiveMainLog(oldLogFile.path);
  };
  log.transports.console.level = false;

  configureSessionLogs({
    directory: paths.sessionLogDirectory,
    retentionDays,
    maxFiles: SESSION_LOG_MAX_FILES,
    idleTimeoutMs: SESSION_LOG_IDLE_TIMEOUT_MS,
  });

  installConsoleCapture();

  // Reclaim space from previous runs on startup; failures must not block boot.
  void pruneLogFiles(logDirectory, {
    retentionDays,
    match: (name) => name.startsWith("main-") && name.endsWith(".log"),
  });
  void pruneSessionLogs();

  createLogger("app").info("logging.configured", {
    logDirectory,
    sessionLogDirectory: paths.sessionLogDirectory,
    verbose: paths.verbose,
  });
}

// Flush and release per-session file streams during app shutdown.
export async function shutdownLogging(): Promise<void> {
  await closeAllSessionLogs();
}

export function createLogger(scope: string): ScopedLogger {
  return {
    debug: (event, details) => writeLog("debug", scope, event, details),
    error: (event, details) => writeLog("error", scope, event, details),
    info: (event, details) => writeLog("info", scope, event, details),
    warn: (event, details) => writeLog("warn", scope, event, details),
  };
}

export function logRendererPayload(payload: RendererLogPayload) {
  const safePayload = sanitizeRendererLogPayload(payload);
  writeLog(
    safePayload.level,
    safePayload.scope,
    safePayload.event,
    safePayload.details,
    "renderer",
  );
}

export function logProcessError(event: string, error: unknown) {
  createLogger("process").error(event, { error: formatErrorForLog(error) });
}

export async function exportDiagnostics(): Promise<DiagnosticsExportResult> {
  const createdAt = new Date().toISOString();
  const safeTimestamp = createdAt.replace(/[:.]/g, "-");
  const targetDirectory = path.join(
    diagnosticsDirectory,
    `agents-diagnostics-${safeTimestamp}`,
  );

  await fs.mkdir(targetDirectory, { recursive: true });

  const copiedFiles = await copyLogFiles(targetDirectory);
  const metadataPath = path.join(targetDirectory, "metadata.json");
  const metadata = {
    appVersion,
    createdAt,
    logDirectory,
    processType: process.type,
    platform: process.platform,
    versions: process.versions,
  };

  await fs.writeFile(
    `${metadataPath}`,
    `${JSON.stringify(metadata, null, 2)}\n`,
  );
  copiedFiles.push(metadataPath);

  createLogger("diagnostics").info("diagnostics.exported", {
    fileCount: copiedFiles.length,
    outputPath: targetDirectory,
  });

  return {
    fileCount: copiedFiles.length,
    outputPath: targetDirectory,
  };
}
