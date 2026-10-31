import path from "node:path";
import type { LogLevel } from "@cocurdex/shared";
import {
  createJsonlFileSink,
  createSessionLogWriter,
  diagnosticsLogLevel,
  installLogSink,
  type JsonlFileSink,
  type LogRecord,
  sanitizeLogDetails,
  writeLog,
} from "@cocurdex/shared/node";
import { getDaemonLogDirectory } from "./paths";

const DAEMON_LOG_FILE_NAME = "daemon.log";
const DAEMON_LOG_MAX_BYTES = 5 * 1024 * 1024;
const RETENTION_DAYS = 7;
const DAEMON_LOG_MAX_ARCHIVES = 10;
const SESSION_LOG_MAX_FILES = 200;
const SESSION_LOG_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

type ConsoleMethod = "debug" | "error" | "info" | "log" | "warn";

const CONSOLE_LEVELS: Record<ConsoleMethod, LogLevel> = {
  debug: "debug",
  error: "error",
  info: "info",
  log: "info",
  warn: "warn",
};

export interface DaemonLogging {
  readonly directory: string;
  readonly filePath: string;
  level(): LogLevel;
  setLevel(level: LogLevel): void;
  close(): Promise<void>;
}

export interface ConfigureDaemonLoggingOptions {
  userDataPath: string;
  env?: NodeJS.ProcessEnv;
  echoToTerminal?: boolean;
}

function consoleDetails(args: unknown[]) {
  const [first, ...rest] = args;
  if (typeof first === "string") {
    return rest.length > 0
      ? { message: first, args: rest }
      : { message: first };
  }
  return { message: sanitizeLogDetails(first, "payload"), args: rest };
}

function echoRecord(record: LogRecord, line: string) {
  const output = record.level === "error" ? process.stderr : process.stdout;
  output.write(line);
}

function captureConsole() {
  const originals = new Map<ConsoleMethod, (...args: unknown[]) => void>();
  for (const method of Object.keys(CONSOLE_LEVELS) as ConsoleMethod[]) {
    originals.set(method, console[method]);
    console[method] = (...args: unknown[]) => {
      writeLog(
        CONSOLE_LEVELS[method],
        "console",
        `console.${method}`,
        consoleDetails(args),
      );
    };
  }
  return () => {
    for (const [method, original] of originals) {
      console[method] = original;
    }
  };
}

export function configureDaemonLogging(
  options: ConfigureDaemonLoggingOptions,
): DaemonLogging {
  const directory = getDaemonLogDirectory(options.userDataPath);
  const echoToTerminal = options.echoToTerminal ?? false;
  const sessionLogs = createSessionLogWriter({
    directory: path.join(directory, "sessions"),
    retentionDays: RETENTION_DAYS,
    maxFiles: SESSION_LOG_MAX_FILES,
    idleTimeoutMs: SESSION_LOG_IDLE_TIMEOUT_MS,
  });
  void sessionLogs.prune();
  const sink: JsonlFileSink = createJsonlFileSink({
    directory,
    fileName: DAEMON_LOG_FILE_NAME,
    maxBytes: DAEMON_LOG_MAX_BYTES,
    retentionDays: RETENTION_DAYS,
    maxArchives: DAEMON_LOG_MAX_ARCHIVES,
    minimumLevel: diagnosticsLogLevel(options.env),
    sessionLogs,
    onRecord(record, line) {
      if (echoToTerminal || record.level === "error") {
        echoRecord(record, line);
      }
    },
  });
  const restoreSink = installLogSink(sink);
  const restoreConsole = captureConsole();

  return {
    directory,
    filePath: sink.filePath,
    level: () => sink.minimumLevel(),
    setLevel: (level) => sink.setMinimumLevel(level),
    async close() {
      restoreConsole();
      restoreSink();
      await sink.close();
    },
  };
}
