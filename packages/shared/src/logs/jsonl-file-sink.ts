import {
  closeSync,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  renameSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import type { LogLevel } from "../logging";
import { buildArchiveLogFileName } from "./log-paths";
import { pruneLogFiles } from "./log-retention";
import {
  isLogLevelAtLeast,
  type LogRecord,
  type LogSink,
  serializeLogRecord,
} from "./logger";
import type { SessionLogWriter } from "./session-log";

const ROTATION_RETRY_DELAY_MS = 60_000;

export interface JsonlFileSinkOptions {
  directory: string;
  fileName: string;
  maxBytes: number;
  retentionDays: number;
  maxArchives: number;
  minimumLevel: LogLevel;
  sessionLogs?: SessionLogWriter;
  onRecord?(record: LogRecord, line: string): void;
}

export interface JsonlFileSink extends LogSink {
  readonly filePath: string;
  setMinimumLevel(level: LogLevel): void;
  minimumLevel(): LogLevel;
  close(): Promise<void>;
}

function archivePrefix(fileName: string) {
  const extension = path.extname(fileName);
  const stem = extension ? fileName.slice(0, -extension.length) : fileName;
  return { stem: `${stem}-`, extension };
}

function sessionIdOf(details: unknown) {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return undefined;
  }
  const sessionId = (details as Record<string, unknown>).sessionId;
  return typeof sessionId === "string" && sessionId.trim()
    ? sessionId
    : undefined;
}

export function createJsonlFileSink(
  options: JsonlFileSinkOptions,
): JsonlFileSink {
  mkdirSync(options.directory, { recursive: true });
  const filePath = path.join(options.directory, options.fileName);
  const archive = archivePrefix(options.fileName);
  const isArchive = (name: string) =>
    name.startsWith(archive.stem) && name.endsWith(archive.extension);
  let minimumLevel = options.minimumLevel;
  let descriptor: number | null = null;
  let size = 0;
  let rotationRetryAt = 0;

  let pruning: Promise<unknown> = Promise.resolve();
  const prune = () => {
    pruning = pruning.then(() =>
      pruneLogFiles(options.directory, {
        retentionDays: options.retentionDays,
        maxFiles: options.maxArchives,
        match: isArchive,
      }),
    );
  };

  const open = () => {
    descriptor = openSync(filePath, "a");
    size = fstatSync(descriptor).size;
    return descriptor;
  };

  const closeDescriptor = () => {
    if (descriptor === null) {
      return;
    }
    try {
      closeSync(descriptor);
    } finally {
      descriptor = null;
    }
  };

  const unusedArchivePath = () => {
    const baseName = buildArchiveLogFileName(options.fileName, new Date());
    const extension = path.extname(baseName);
    const stem = baseName.slice(0, baseName.length - extension.length);
    let candidate = path.join(options.directory, baseName);
    for (let index = 1; existsSync(candidate); index += 1) {
      candidate = path.join(options.directory, `${stem}-${index}${extension}`);
    }
    return candidate;
  };

  const rotate = () => {
    closeDescriptor();
    try {
      renameSync(filePath, unusedArchivePath());
    } catch {
      rotationRetryAt = Date.now() + ROTATION_RETRY_DELAY_MS;
    }
    prune();
  };

  prune();

  return {
    filePath,
    accepts: (level) => isLogLevelAtLeast(level, minimumLevel),
    setMinimumLevel(level) {
      minimumLevel = level;
    },
    minimumLevel: () => minimumLevel,
    write(record) {
      const line = `${serializeLogRecord(record)}\n`;
      const bytes = Buffer.byteLength(line);
      if (
        descriptor !== null &&
        size > 0 &&
        size + bytes > options.maxBytes &&
        Date.now() >= rotationRetryAt
      ) {
        rotate();
      }
      const target = descriptor ?? open();
      writeSync(target, line);
      size += bytes;
      const sessionId = sessionIdOf(record.details);
      if (sessionId) {
        options.sessionLogs?.write(sessionId, line.trimEnd());
      }
      options.onRecord?.(record, line);
    },
    async close() {
      closeDescriptor();
      await pruning;
      await options.sessionLogs?.closeAll();
    },
  };
}
