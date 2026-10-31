import { renameSync } from "node:fs";
import path from "node:path";
import {
  type RequestClientOptions,
  requestDaemon,
} from "@cocurdex/daemon/client";
import type {
  DiagnosticsExportResult,
  LogDetails,
  LogLevel,
  RendererLogPayload,
} from "@cocurdex/shared";
import {
  buildArchiveLogFileName,
  createSessionLogWriter,
  formatErrorForLog,
  formatReadableLogLine,
  installLogSink,
  isLogLevelAtLeast,
  pruneLogFiles,
  type SessionLogWriter,
  sanitizeLogDetails,
} from "@cocurdex/shared/node";
import log from "electron-log/main.js";
import type { CrashDumpDescriptor } from "./crash-reporter";
import {
  readDiagnosticsPreferences,
  writeDiagnosticsPreferences,
} from "./diagnostics-preferences";
import { sanitizeRendererLogPayload } from "./logger-utils";

const LOG_FILE_NAME = "main.log";
const FILE_TRANSPORT_MAX_SIZE = 5 * 1024 * 1024;
const DEFAULT_RETENTION_DAYS = 7;
const MAIN_LOG_MAX_ARCHIVES = 10;
// Secondary bound on per-session files; day-based retention stays primary.
const SESSION_LOG_MAX_FILES = 200;
const SESSION_LOG_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

let logDirectory = "";
let sessionLogs: SessionLogWriter | null = null;
let diagnosticsPreferencesPath = "";
let appVersion = "unknown";
let retentionDays = DEFAULT_RETENTION_DAYS;
let baselineVerbose = false;
let verbosePreference = false;
let envDiagnosticsRequested = false;
let consoleInstalled = false;

const originalConsole = {
  debug: console.debug.bind(console),
  error: console.error.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
};

export interface ScopedLogger {
  debug(event: string, details?: LogDetails): void;
  error(event: string, details?: LogDetails): void;
  info(event: string, details?: LogDetails): void;
  warn(event: string, details?: LogDetails): void;
}

function normalizeLogLevel(level: LogLevel) {
  return level === "debug" ? "debug" : level;
}

function serializeLogEntry(
  level: LogLevel,
  scope: string,
  event: string,
  details?: LogDetails,
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
  level: LogLevel,
  scope: string,
  event: string,
  details?: LogDetails,
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
    sessionLogs?.write(
      sessionId,
      buildLogLine(entry, new Date().toISOString()),
    );
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

let capturingConsole = false;

function captureConsole(level: LogLevel, args: unknown[]) {
  if (capturingConsole) {
    return;
  }
  capturingConsole = true;
  try {
    writeLog(level, "console", `console.${level}`, consoleArgsToDetails(args));
  } finally {
    capturingConsole = false;
  }
}

function installConsoleCapture() {
  if (consoleInstalled) {
    return;
  }

  consoleInstalled = true;

  console.debug = (...args: unknown[]) => {
    originalConsole.debug(...args);
    captureConsole("debug", args);
  };
  console.info = (...args: unknown[]) => {
    originalConsole.info(...args);
    captureConsole("info", args);
  };
  console.warn = (...args: unknown[]) => {
    originalConsole.warn(...args);
    captureConsole("warn", args);
  };
  console.error = (...args: unknown[]) => {
    originalConsole.error(...args);
    captureConsole("error", args);
  };
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
    maxFiles: MAIN_LOG_MAX_ARCHIVES,
    match: (name) => name.startsWith("main-") && name.endsWith(".log"),
  });
}

export function configureLogging(paths: {
  appVersion: string;
  diagnosticsPreferencesPath: string;
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
  diagnosticsPreferencesPath = paths.diagnosticsPreferencesPath;
  retentionDays = paths.retentionDays ?? DEFAULT_RETENTION_DAYS;
  baselineVerbose = paths.verbose;
  envDiagnosticsRequested = process.env.COCURDEX_DIAGNOSTICS === "1";
  verbosePreference = readDiagnosticsPreferences(
    diagnosticsPreferencesPath,
  ).verbose;
  if (verbosePreference) {
    process.env.COCURDEX_DIAGNOSTICS = "1";
  }

  log.transports.file.fileName = LOG_FILE_NAME;
  log.transports.file.level =
    baselineVerbose || verbosePreference ? "debug" : "info";
  log.transports.file.maxSize = FILE_TRANSPORT_MAX_SIZE;
  log.transports.file.format = paths.pretty
    ? ({ data, message }) => {
        const entry = data[0] as ReturnType<typeof serializeLogEntry>;
        return [
          formatReadableLogLine({
            ...entry,
            details: entry.details as LogDetails,
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
  log.transports.ipc.level = false;

  sessionLogs = createSessionLogWriter({
    directory: paths.sessionLogDirectory,
    retentionDays,
    maxFiles: SESSION_LOG_MAX_FILES,
    idleTimeoutMs: SESSION_LOG_IDLE_TIMEOUT_MS,
  });

  installConsoleCapture();
  installLogSink({
    accepts: (level) =>
      isLogLevelAtLeast(
        level,
        log.transports.file.level === "debug" ? "debug" : "info",
      ),
    write: (record) =>
      writeLog(
        record.level,
        record.scope,
        record.event,
        record.details as LogDetails,
      ),
  });

  // Reclaim space from previous runs on startup; failures must not block boot.
  void pruneLogFiles(logDirectory, {
    retentionDays,
    maxFiles: MAIN_LOG_MAX_ARCHIVES,
    match: (name) => name.startsWith("main-") && name.endsWith(".log"),
  });
  void sessionLogs.prune();

  createLogger("app").info("logging.configured", {
    logDirectory,
    sessionLogDirectory: paths.sessionLogDirectory,
    verbose: paths.verbose,
    verbosePreference,
  });
}

export function isDiagnosticsVerbose() {
  return verbosePreference;
}

export function setDiagnosticsVerbose(enabled: boolean) {
  verbosePreference = enabled;
  if (diagnosticsPreferencesPath) {
    try {
      writeDiagnosticsPreferences(diagnosticsPreferencesPath, {
        verbose: enabled,
      });
    } catch (error) {
      createLogger("diagnostics").warn("diagnostics.preferencesWriteFailed", {
        error: formatErrorForLog(error),
      });
    }
  }
  // Picked up by the next daemon spawn (env inherits process.env).
  if (enabled || envDiagnosticsRequested) {
    process.env.COCURDEX_DIAGNOSTICS = "1";
  } else {
    delete process.env.COCURDEX_DIAGNOSTICS;
  }
  log.transports.file.level = enabled || baselineVerbose ? "debug" : "info";
}

export function daemonDiagnosticsLogLevel() {
  return verbosePreference || envDiagnosticsRequested ? "debug" : "info";
}

// Flush and release per-session file streams during app shutdown.
export async function shutdownLogging(): Promise<void> {
  await sessionLogs?.closeAll();
}

export function createLogger(scope: string): ScopedLogger {
  return {
    debug: (event, details) => writeLog("debug", scope, event, details),
    error: (event, details) => writeLog("error", scope, event, details),
    info: (event, details) => writeLog("info", scope, event, details),
    warn: (event, details) => writeLog("warn", scope, event, details),
  };
}

export function createUpstreamLogger(scope: string) {
  const scoped = createLogger(scope);
  const forward = (level: LogLevel) => (message?: unknown) =>
    scoped[level]("upstream.log", { message });
  return {
    debug: forward("debug"),
    error: forward("error"),
    info: forward("info"),
    warn: forward("warn"),
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

export interface DiagnosticsExportOptions {
  crashReports?: CrashDumpDescriptor[];
  daemon: RequestClientOptions;
}

export async function exportDiagnostics(
  options: DiagnosticsExportOptions,
): Promise<DiagnosticsExportResult> {
  const result = await requestDaemon(
    "diagnostics.export",
    {
      hostLogDirectories: logDirectory
        ? [{ name: "desktop", path: logDirectory }]
        : [],
      hostMetadata: {
        appVersion,
        arch: process.arch,
        crashReports: options.crashReports ?? [],
        memoryRssBytes: process.memoryUsage().rss,
        platform: process.platform,
        processType: process.type,
        uptimeSeconds: Math.round(process.uptime()),
        verboseLogging: log.transports.file.level,
        versions: process.versions,
      },
    },
    options.daemon,
  );
  createLogger("diagnostics").info("diagnostics.exported", {
    fileCount: result.fileCount,
  });
  return result;
}
