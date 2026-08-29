import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import path from "node:path";
import readline from "node:readline";
import { rgPath } from "@vscode/ripgrep";
import type { WebContents } from "electron";
import type {
  WorkspaceSearchDoneEvent,
  WorkspaceSearchErrorEvent,
  WorkspaceSearchMatch,
  WorkspaceSearchResultEvent,
  WorkspaceSearchStartPayload,
} from "../../src/lib/types";

const BATCH_SIZE = 50;
const BATCH_INTERVAL_MS = 32;
const MAX_ERROR_MESSAGE_LENGTH = 500;

interface ActiveSearch {
  child: ChildProcessWithoutNullStreams;
  windowWebContentsId: number;
  flushTimer: NodeJS.Timeout | null;
  pending: WorkspaceSearchMatch[];
  resultCount: number;
  finished: boolean;
}

interface RipgrepMatchRecord {
  type: "match";
  data: {
    path: { text: string };
    lines: { text: string };
    line_number: number;
    submatches: Array<{
      start: number;
      end: number;
    }>;
  };
}

function resolveRgPath() {
  return rgPath.replace("app.asar", "app.asar.unpacked");
}

function truncateErrorMessage(message: string) {
  const trimmed = message.trim();
  if (trimmed.length <= MAX_ERROR_MESSAGE_LENGTH) {
    return trimmed;
  }
  return `${trimmed.slice(0, MAX_ERROR_MESSAGE_LENGTH)}...`;
}

const GLOB_MAGIC = /[*?{}[\]]/;

// Expand a single user-typed pattern into ripgrep glob patterns, mirroring how
// VS Code treats include/exclude entries. A bare segment with no glob magic
// (e.g. ".claude" or "src") should match that name anywhere in the tree and
// everything beneath it, so we emit both the directory tree and basename forms.
function expandGlobPattern(pattern: string): string[] {
  if (GLOB_MAGIC.test(pattern) || pattern.includes("/")) {
    return [pattern];
  }
  return [`**/${pattern}/**`, `**/${pattern}`];
}

function toGlobArgs(patterns: string, negate: boolean): string[] {
  return patterns
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => expandGlobPattern(entry))
    .flatMap((glob) => ["-g", negate ? `!${glob}` : glob]);
}

function buildRgArgs(payload: WorkspaceSearchStartPayload) {
  const args = ["--json", "--line-buffered", "--max-count", "100"];

  if (payload.caseSensitive) {
    args.push("-s");
  } else {
    args.push("-i");
  }

  if (payload.wholeWord) {
    args.push("-w");
  }

  if (!payload.useRegex) {
    args.push("-F");
  }

  args.push(...toGlobArgs(payload.include, false));
  args.push(...toGlobArgs(payload.exclude, true));

  args.push("--", payload.query.trim(), ".");
  return args;
}

export function getUtf16ColumnFromByteOffset(
  lineBuffer: Buffer,
  byteOffset: number,
) {
  const safeOffset = Math.max(0, Math.min(byteOffset, lineBuffer.byteLength));
  return lineBuffer.subarray(0, safeOffset).toString("utf8").length + 1;
}

export function getUtf16RangeFromByteOffsets(
  lineBuffer: Buffer,
  startByteOffset: number,
  endByteOffset: number,
) {
  return {
    startColumn: getUtf16ColumnFromByteOffset(lineBuffer, startByteOffset),
    endColumn: getUtf16ColumnFromByteOffset(lineBuffer, endByteOffset),
  };
}

function parseMatchLine(line: string): WorkspaceSearchMatch | null {
  let record: unknown;
  try {
    record = JSON.parse(line);
  } catch {
    return null;
  }

  if (
    !record ||
    typeof record !== "object" ||
    (record as { type?: unknown }).type !== "match"
  ) {
    return null;
  }

  const matchRecord = record as RipgrepMatchRecord;
  const text = matchRecord.data.lines.text.replace(/\r?\n$/, "");
  const lineBuffer = Buffer.from(matchRecord.data.lines.text, "utf8");

  return {
    filePath: matchRecord.data.path.text,
    line: matchRecord.data.line_number,
    ranges: matchRecord.data.submatches.map((submatch) =>
      getUtf16RangeFromByteOffsets(lineBuffer, submatch.start, submatch.end),
    ),
    text,
  };
}

export class WorkspaceSearchService {
  private readonly searches = new Map<string, ActiveSearch>();

  start(payload: WorkspaceSearchStartPayload, webContents: WebContents) {
    const query = payload.query.trim();
    this.cancel(payload.searchId);

    if (!query) {
      this.sendDone(webContents, {
        reason: "empty-query",
        searchId: payload.searchId,
      });
      return;
    }

    const child = spawn(resolveRgPath(), buildRgArgs(payload), {
      cwd: payload.rootPath,
      env: process.env,
    });
    const search: ActiveSearch = {
      child,
      finished: false,
      flushTimer: null,
      pending: [],
      resultCount: 0,
      windowWebContentsId: webContents.id,
    };

    this.searches.set(payload.searchId, search);

    const flush = () => {
      search.flushTimer = null;
      if (search.pending.length === 0 || webContents.isDestroyed()) {
        return;
      }

      const batch = search.pending.splice(0);
      this.sendResult(webContents, { batch, searchId: payload.searchId });
    };

    const scheduleFlush = () => {
      if (search.pending.length >= BATCH_SIZE) {
        if (search.flushTimer) {
          clearTimeout(search.flushTimer);
          search.flushTimer = null;
        }
        flush();
        return;
      }

      if (!search.flushTimer) {
        search.flushTimer = setTimeout(flush, BATCH_INTERVAL_MS);
      }
    };

    const rl = readline.createInterface({ input: child.stdout });
    let stderr = "";

    rl.on("line", (line) => {
      if (search.finished) {
        return;
      }

      const match = parseMatchLine(line);
      if (!match) {
        return;
      }

      match.filePath = path.resolve(payload.rootPath, match.filePath);
      search.pending.push(match);
      search.resultCount += 1;

      if (search.resultCount >= payload.maxResults) {
        search.finished = true;
        child.kill();
        flush();
        this.sendDone(webContents, {
          reason: "limit-reached",
          searchId: payload.searchId,
        });
        this.cleanup(payload.searchId);
        return;
      }

      scheduleFlush();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > MAX_ERROR_MESSAGE_LENGTH * 2) {
        stderr = stderr.slice(0, MAX_ERROR_MESSAGE_LENGTH * 2);
      }
    });

    child.on("error", (error) => {
      if (search.finished) {
        return;
      }
      search.finished = true;
      this.sendError(webContents, {
        message: truncateErrorMessage(error.message),
        searchId: payload.searchId,
      });
      this.cleanup(payload.searchId);
    });

    child.on("close", (code, signal) => {
      if (search.finished) {
        return;
      }

      search.finished = true;
      flush();
      this.cleanup(payload.searchId);

      if (signal) {
        this.sendDone(webContents, {
          reason: "cancelled",
          searchId: payload.searchId,
        });
        return;
      }

      if (code === 0 || code === 1) {
        this.sendDone(webContents, {
          reason: "completed",
          searchId: payload.searchId,
        });
        return;
      }

      this.sendError(webContents, {
        message: truncateErrorMessage(
          stderr || `ripgrep exited with code ${code}`,
        ),
        searchId: payload.searchId,
      });
    });
  }

  cancel(searchId: string) {
    const search = this.searches.get(searchId);
    if (!search) {
      return;
    }

    search.finished = true;
    search.child.kill();
    this.cleanup(searchId);
  }

  cancelForWebContents(webContentsId: number) {
    for (const [searchId, search] of this.searches) {
      if (search.windowWebContentsId === webContentsId) {
        this.cancel(searchId);
      }
    }
  }

  dispose() {
    const failures: unknown[] = [];
    for (const searchId of Array.from(this.searches.keys())) {
      try {
        this.cancel(searchId);
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, "Failed to stop workspace searches");
    }
  }

  private cleanup(searchId: string) {
    const search = this.searches.get(searchId);
    if (search?.flushTimer) {
      clearTimeout(search.flushTimer);
    }
    this.searches.delete(searchId);
  }

  private sendResult(
    webContents: WebContents,
    event: WorkspaceSearchResultEvent,
  ) {
    if (!webContents.isDestroyed()) {
      webContents.send("search:result", event);
    }
  }

  private sendDone(webContents: WebContents, event: WorkspaceSearchDoneEvent) {
    if (!webContents.isDestroyed()) {
      webContents.send("search:done", event);
    }
  }

  private sendError(
    webContents: WebContents,
    event: WorkspaceSearchErrorEvent,
  ) {
    if (!webContents.isDestroyed()) {
      webContents.send("search:error", event);
    }
  }
}

export const workspaceSearchService = new WorkspaceSearchService();
