import { LOG_LEVELS, type LogLevel } from "../logging";
import { sanitizeLogDetails } from "./redaction";

export interface LogRecord {
  timestamp: string;
  level: LogLevel;
  scope: string;
  event: string;
  pid: number;
  details?: unknown;
}

export interface LogSink {
  accepts(level: LogLevel): boolean;
  write(record: LogRecord): void;
}

export interface Logger {
  debug(event: string, details?: Record<string, unknown>): void;
  info(event: string, details?: Record<string, unknown>): void;
  warn(event: string, details?: Record<string, unknown>): void;
  error(event: string, details?: Record<string, unknown>): void;
}

export function isLogLevelAtLeast(level: LogLevel, minimum: LogLevel) {
  return LOG_LEVELS.indexOf(level) >= LOG_LEVELS.indexOf(minimum);
}

export function diagnosticsLogLevel(
  env: NodeJS.ProcessEnv = process.env,
): LogLevel {
  return env.COCURDEX_DIAGNOSTICS === "1" ? "debug" : "info";
}

export function serializeLogRecord(record: LogRecord) {
  try {
    return JSON.stringify(record);
  } catch {
    return JSON.stringify({ ...record, details: "[unserializable]" });
  }
}

export function createStreamLogSink(
  minimumLevel: LogLevel = diagnosticsLogLevel(),
): LogSink {
  return {
    accepts: (level) => isLogLevelAtLeast(level, minimumLevel),
    write(record) {
      process.stderr.write(`${serializeLogRecord(record)}\n`);
    },
  };
}

let activeSink: LogSink = createStreamLogSink();

export function installLogSink(sink: LogSink) {
  const previous = activeSink;
  activeSink = sink;
  return () => {
    if (activeSink === sink) {
      activeSink = previous;
    }
  };
}

export function writeLog(
  level: LogLevel,
  scope: string,
  event: string,
  details?: unknown,
) {
  const sink = activeSink;
  if (!sink.accepts(level)) {
    return;
  }
  const sanitized =
    details === undefined ? undefined : sanitizeLogDetails(details);
  try {
    sink.write({
      timestamp: new Date().toISOString(),
      level,
      scope,
      event,
      pid: process.pid,
      ...(sanitized === undefined ? {} : { details: sanitized }),
    });
  } catch {
    return;
  }
}

export function createLogger(scope: string): Logger {
  return {
    debug: (event, details) => writeLog("debug", scope, event, details),
    info: (event, details) => writeLog("info", scope, event, details),
    warn: (event, details) => writeLog("warn", scope, event, details),
    error: (event, details) => writeLog("error", scope, event, details),
  };
}
