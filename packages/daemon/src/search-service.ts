import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import type {
  WorkspaceSearchDaemonEvent,
  WorkspaceSearchMatch,
  WorkspaceSearchStartPayload,
} from "@cocurdex/shared";

const BATCH_SIZE = 50;
const BATCH_INTERVAL_MS = 32;
const MAX_ERROR_MESSAGE_LENGTH = 500;

interface ActiveSearch {
  child: ChildProcessWithoutNullStreams;
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

function getProcessResourcesPath() {
  return (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
}

// The bundled daemon.cjs sits at <resources>/cli/daemon.cjs, one level below
// the resources directory that also holds app.asar.unpacked and vendor/.
const moduleDir = path.dirname(fileURLToPath(import.meta.url));

// Resolve lazily: in the packaged bundle this require runs from
// resources/cli, where the platform package only exists inside
// app.asar.unpacked — a top-level import would throw before the daemon starts.
function resolveBundledRipgrepPath(executable: string) {
  try {
    const require = createRequire(import.meta.url);
    const platformPkg = `@vscode/ripgrep-${process.platform}-${process.arch}`;
    return require
      .resolve(`${platformPkg}/bin/${executable}`)
      .replace("app.asar", "app.asar.unpacked");
  } catch {
    return null;
  }
}

// Resolution order: explicit env override, then the packaged desktop layout
// (app.asar.unpacked next to resources/cli/daemon.cjs), then the workspace
// node_modules copy used in development.
async function resolveRipgrepPath(): Promise<string> {
  const executable = process.platform === "win32" ? "rg.exe" : "rg";
  const platformPkgDir = `@vscode/ripgrep-${process.platform}-${process.arch}`;
  const candidates = [
    process.env.COCURDEX_RIPGREP_PATH,
    getProcessResourcesPath()
      ? path.join(
          getProcessResourcesPath() ?? "",
          `app.asar.unpacked/node_modules/${platformPkgDir}/bin`,
          executable,
        )
      : null,
    path.resolve(
      moduleDir,
      `../app.asar.unpacked/node_modules/${platformPkgDir}/bin`,
      executable,
    ),
    resolveBundledRipgrepPath(executable),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error("ripgrep binary not found");
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

interface DaemonSearchServiceOptions {
  broadcast(event: WorkspaceSearchDaemonEvent): void;
  canScanRoot(rootPath: string): Promise<boolean>;
}

export class DaemonSearchService {
  private readonly searches = new Map<string, ActiveSearch>();

  constructor(private readonly options: DaemonSearchServiceOptions) {}

  get activeCount() {
    return this.searches.size;
  }

  async start(payload: WorkspaceSearchStartPayload): Promise<void> {
    if (!(await this.options.canScanRoot(payload.rootPath))) {
      throw new Error(
        "search.start rejected: rootPath is not a registered workspace root or worktree",
      );
    }

    const query = payload.query.trim();
    this.cancel(payload.searchId);

    if (!query) {
      this.emit({
        type: "search.done",
        reason: "empty-query",
        searchId: payload.searchId,
      });
      return;
    }

    const child = spawn(await resolveRipgrepPath(), buildRgArgs(payload), {
      cwd: payload.rootPath,
      env: process.env,
    });
    const search: ActiveSearch = {
      child,
      finished: false,
      flushTimer: null,
      pending: [],
      resultCount: 0,
    };

    this.searches.set(payload.searchId, search);

    const flush = () => {
      search.flushTimer = null;
      if (search.pending.length === 0) {
        return;
      }

      const batch = search.pending.splice(0);
      this.emit({
        type: "search.result",
        batch,
        searchId: payload.searchId,
      });
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
        this.emit({
          type: "search.done",
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
      this.emit({
        type: "search.error",
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
        this.emit({
          type: "search.done",
          reason: "cancelled",
          searchId: payload.searchId,
        });
        return;
      }

      if (code === 0 || code === 1) {
        this.emit({
          type: "search.done",
          reason: "completed",
          searchId: payload.searchId,
        });
        return;
      }

      this.emit({
        type: "search.error",
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

  private emit(event: WorkspaceSearchDaemonEvent) {
    this.options.broadcast(event);
  }

  private cleanup(searchId: string) {
    const search = this.searches.get(searchId);
    if (search?.flushTimer) {
      clearTimeout(search.flushTimer);
    }
    this.searches.delete(searchId);
  }
}
