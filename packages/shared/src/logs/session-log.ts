import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import path from "node:path";
import { buildSessionLogFileName } from "./log-paths";
import { pruneLogFiles } from "./log-retention";

export interface SessionLogConfig {
  directory: string;
  retentionDays: number;
  maxFiles: number;
  idleTimeoutMs: number;
}

export interface SessionLogWriter {
  write(sessionId: string, line: string): void;
  close(sessionId: string): void;
  closeAll(): Promise<void>;
  prune(now?: number): Promise<string[]>;
}

interface OpenSessionLog {
  stream: WriteStream;
  idleTimer: NodeJS.Timeout | null;
}

function endStream(stream: WriteStream) {
  return new Promise<void>((resolve) => {
    stream.end(() => resolve());
  });
}

export function createSessionLogWriter(
  config: SessionLogConfig,
): SessionLogWriter {
  mkdirSync(config.directory, { recursive: true });
  const sessionPaths = new Map<string, string>();
  const openLogs = new Map<string, OpenSessionLog>();

  const resolveSessionPath = (sessionId: string) => {
    const existing = sessionPaths.get(sessionId);
    if (existing) {
      return existing;
    }
    const filePath = path.join(
      config.directory,
      buildSessionLogFileName(sessionId, new Date()),
    );
    sessionPaths.set(sessionId, filePath);
    return filePath;
  };

  const openStream = (sessionId: string) => {
    const existing = openLogs.get(sessionId);
    if (existing) {
      return existing;
    }
    const stream = createWriteStream(resolveSessionPath(sessionId), {
      encoding: "utf8",
      flags: "a",
    });
    stream.on("error", () => {
      openLogs.delete(sessionId);
    });
    const entry: OpenSessionLog = { stream, idleTimer: null };
    openLogs.set(sessionId, entry);
    return entry;
  };

  const detach = (sessionId: string) => {
    const entry = openLogs.get(sessionId);
    if (!entry) {
      return null;
    }
    if (entry.idleTimer) {
      clearTimeout(entry.idleTimer);
    }
    openLogs.delete(sessionId);
    return entry.stream;
  };

  const close = (sessionId: string) => {
    detach(sessionId)?.end();
  };

  return {
    write(sessionId, line) {
      const entry = openStream(sessionId);
      entry.stream.write(`${line}\n`);
      if (entry.idleTimer) {
        clearTimeout(entry.idleTimer);
      }
      entry.idleTimer = setTimeout(
        () => close(sessionId),
        config.idleTimeoutMs,
      );
      entry.idleTimer.unref?.();
    },
    close,
    async closeAll() {
      const streams = [...openLogs.keys()]
        .map((sessionId) => detach(sessionId))
        .filter((stream): stream is WriteStream => stream !== null);
      await Promise.all(streams.map(endStream));
    },
    prune(now = Date.now()) {
      return pruneLogFiles(config.directory, {
        retentionDays: config.retentionDays,
        maxFiles: config.maxFiles,
        now,
      });
    },
  };
}
