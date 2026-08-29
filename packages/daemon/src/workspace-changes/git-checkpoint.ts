import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  inferReviewKind,
  type TurnFileChange,
  type TurnFileOperation,
} from "@cocurdex/shared";
import { removeWorkspaceFile, writeFileAtomically } from "./atomic-write";
import type {
  HostCheckpointAdapter,
  RestorePathPlan,
  RestorePathResult,
} from "./checkpoint";
import { runGit, runGitWithInput } from "./git-run";
import {
  MAX_CHECKPOINT_FILE_BYTES,
  MAX_GIT_CHECKPOINT_CHANGED_BYTES,
} from "./hash";
import { isIgnoredWorkspacePath } from "./ignore-policy";
import {
  assertSafeRestorePlan,
  resolveWorkspacePath,
  UnsafeWorkspacePathError,
} from "./path-safety";

function sanitizeRefPart(value: string) {
  return value.replace(/[^A-Za-z0-9._-]/g, "_");
}

export function gitCheckpointRef(
  sessionId: string,
  userMessageId: string,
  phase: string,
) {
  return `refs/cocurdex/checkpoints/${sanitizeRefPart(sessionId)}/turn/${sanitizeRefPart(userMessageId)}/${sanitizeRefPart(phase)}`;
}

export function createGitCheckpointAdapter(
  options: { maxChangedBytes?: number } = {},
): HostCheckpointAdapter {
  const maxChangedBytes =
    options.maxChangedBytes ?? MAX_GIT_CHECKPOINT_CHANGED_BYTES;
  return {
    kind: "git-checkpoint",
    async capture(input) {
      await assertGitCheckpointBudget(input.workspaceRootPath, maxChangedBytes);
      const commit = await captureGitCommit(input.workspaceRootPath);
      const ref = gitCheckpointRef(
        input.sessionId,
        input.userMessageId,
        input.phase,
      );
      await runGit(["update-ref", ref, commit], {
        cwd: input.workspaceRootPath,
      });
      return {
        id: ref,
        kind: "git-checkpoint",
        ref,
        workspaceRootPath: input.workspaceRootPath,
      };
    },
    async diff(before, after) {
      return diffGitCheckpoints(
        before.workspaceRootPath,
        before.ref,
        after.ref,
      );
    },
    async readFile(checkpoint, relativePath) {
      return readGitBlob(
        checkpoint.workspaceRootPath,
        checkpoint.ref,
        relativePath,
      );
    },
    async restorePaths(input) {
      const results: RestorePathResult[] = [];
      for (let index = 0; index < input.paths.length; index += 1) {
        const plan = input.paths[index];
        if (!plan) {
          continue;
        }
        try {
          await restoreGitPath(
            input.workspaceRootPath,
            input.checkpoint.ref,
            plan,
          );
          results.push({ path: plan.path, status: "restored" });
        } catch (error) {
          results.push({
            path: plan.path,
            status: "failed",
            reason:
              error instanceof Error ? error.message : "Failed to restore file",
          });
          if (error instanceof UnsafeWorkspacePathError) {
            for (const remaining of input.paths.slice(index + 1)) {
              results.push({
                path: remaining.path,
                status: "skipped",
                reason: "Restore aborted after an unsafe path was detected",
              });
            }
            break;
          }
        }
      }
      return results;
    },
    async hashWorkingTreeFile(workspaceRootPath, relativePath) {
      try {
        const resolved = resolveWorkspacePath(workspaceRootPath, relativePath);
        const output = await runGit(["hash-object", "--", resolved.relative], {
          cwd: workspaceRootPath,
          allowFailure: true,
        });
        const hash = output.trim();
        return hash.length > 0 ? hash : null;
      } catch {
        return null;
      }
    },
    async listCheckpoints(input) {
      const cwd = input?.workspaceRootPath;
      if (!cwd) {
        return [];
      }
      const listed = await runGit(
        ["for-each-ref", "--format=%(refname)", "refs/cocurdex/checkpoints"],
        { cwd, allowFailure: true },
      );
      return listed
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((ref) => ({
          ref,
          workspaceRootPath: cwd,
        }));
    },
    async cleanup(input) {
      const cwd = input.workspaceRootPath;
      if (!cwd) {
        return;
      }
      const existing = await runGit(
        ["for-each-ref", "--format=%(refname)", "refs/cocurdex/checkpoints"],
        { cwd, allowFailure: true },
      );
      const current = existing
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const keep = new Set(input.refs.filter((ref) => ref.startsWith("refs/")));
      const deleteRefs = new Set<string>();
      if (input.pruneUnreferenced) {
        for (const ref of current) {
          if (!keep.has(ref)) {
            deleteRefs.add(ref);
          }
        }
      } else {
        for (const ref of keep) {
          deleteRefs.add(ref);
        }
        if (input.sessionId) {
          const prefix = `refs/cocurdex/checkpoints/${sanitizeRefPart(input.sessionId)}`;
          for (const ref of current) {
            if (ref.startsWith(`${prefix}/`) || ref === prefix) {
              deleteRefs.add(ref);
            }
          }
        }
      }
      for (const ref of deleteRefs) {
        await runGit(["update-ref", "-d", ref], {
          cwd,
          allowFailure: true,
        });
      }
    },
  };
}

async function assertGitCheckpointBudget(
  workspaceRootPath: string,
  maxChangedBytes: number,
) {
  const status = await runGit(
    ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    { cwd: workspaceRootPath },
  );
  const records = status.split("\0");
  let changedBytes = 0;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record || record.length < 4) {
      continue;
    }
    const statusCode = record.slice(0, 2);
    const relativePath = record.slice(3);
    if (statusCode.includes("R") || statusCode.includes("C")) {
      index += 1;
    }
    if (statusCode.includes("D")) {
      continue;
    }
    const fileStat = await lstat(
      path.join(workspaceRootPath, relativePath),
    ).catch(() => null);
    if (!fileStat?.isFile() && !fileStat?.isSymbolicLink()) {
      continue;
    }
    changedBytes += fileStat.size;
    if (changedBytes > maxChangedBytes) {
      throw new Error(
        `Git checkpoint changed-content limit exceeded (${maxChangedBytes} bytes)`,
      );
    }
  }
}

/**
 * Checkpoints reuse one scratch index per workspace so `git add -A` can rely
 * on its stat cache. A throwaway index re-hashes the whole working tree on
 * every turn, which dominates checkpoint cost on large repositories.
 */
const indexLocks = new Map<string, Promise<unknown>>();

async function withScratchIndex<T>(
  workspaceRootPath: string,
  run: (env: { GIT_INDEX_FILE: string }, cold: boolean) => Promise<T>,
): Promise<T> {
  const key = path.resolve(workspaceRootPath);
  const indexFile = path.join(
    tmpdir(),
    "cocurdex-git-index",
    `${createHash("sha1").update(key).digest("hex")}.index`,
  );
  await mkdir(path.dirname(indexFile), { recursive: true });
  const cold = !existsSync(indexFile);
  const previous = indexLocks.get(key) ?? Promise.resolve();
  const current = previous.then(
    () => run({ GIT_INDEX_FILE: indexFile }, cold),
    () => run({ GIT_INDEX_FILE: indexFile }, cold),
  );
  indexLocks.set(
    key,
    current.catch(() => undefined),
  );
  try {
    return await current;
  } finally {
    if (indexLocks.get(key) === current) {
      indexLocks.delete(key);
    }
  }
}

export function captureGitCommit(workspaceRootPath: string) {
  return withScratchIndex(workspaceRootPath, async (env, cold) => {
    // A cold index starts from HEAD so files that are tracked but also
    // gitignored stay in the tree; later captures reuse the stat cache.
    if (cold) {
      const head = await runGit(["rev-parse", "--verify", "HEAD"], {
        cwd: workspaceRootPath,
        env,
        allowFailure: true,
      });
      if (head.trim()) {
        await runGit(["read-tree", "HEAD"], { cwd: workspaceRootPath, env });
      }
    }
    await runGit(["add", "-A", "--", "."], { cwd: workspaceRootPath, env });
    const tree = (
      await runGit(["write-tree"], { cwd: workspaceRootPath, env })
    ).trim();
    return (
      await runGit(
        ["commit-tree", tree, "-m", "cocurdex workspace checkpoint"],
        { cwd: workspaceRootPath, env },
      )
    ).trim();
  });
}

async function diffGitCheckpoints(
  cwd: string,
  beforeRef: string,
  afterRef: string,
) {
  // `--raw` already carries both blob ids, so no per-file `ls-tree` is needed.
  const raw = await runGit(
    // --abbrev=40 keeps the full blob ids that restore verification compares.
    [
      "diff",
      "--find-renames",
      "-z",
      "--raw",
      "--abbrev=40",
      beforeRef,
      afterRef,
    ],
    { cwd },
  );
  const numstat = await runGit(
    ["diff", "--find-renames", "--numstat", beforeRef, afterRef],
    { cwd },
  );
  const stats = parseNumstat(numstat);
  const entries = parseRawDiff(raw).filter(
    (entry) => !isIgnoredWorkspacePath(entry.path),
  );
  const beforeSizes = await readBlobSizes(
    cwd,
    entries.map((entry) => entry.beforeHash),
  );

  const files = await mapWithConcurrency(entries, 8, async (entry) => {
    const stat = stats.get(entry.path);
    const reviewKind = inferReviewKind(entry.path);
    const includePatch =
      reviewKind === "text" &&
      stat &&
      stat.additions != null &&
      stat.deletions != null;
    const patch = includePatch
      ? await runGit(
          ["diff", "--find-renames", beforeRef, afterRef, "--", entry.path],
          { cwd },
        )
      : null;
    const beforeSize = entry.beforeHash
      ? (beforeSizes.get(entry.beforeHash) ?? null)
      : null;
    const restorable =
      entry.operation === "add" ||
      (beforeSize != null && beforeSize <= MAX_CHECKPOINT_FILE_BYTES);
    return {
      path: entry.path,
      previousPath: entry.previousPath,
      operation: entry.operation,
      reviewKind,
      additions: stat?.additions ?? null,
      deletions: stat?.deletions ?? null,
      patch: patch?.trim() ? patch : null,
      beforeHash: entry.beforeHash,
      afterHash: entry.afterHash,
      beforeSize,
      restorable,
    } satisfies TurnFileChange;
  });
  return files;
}

async function mapWithConcurrency<Item, Result>(
  items: Item[],
  limit: number,
  run: (item: Item) => Promise<Result>,
): Promise<Result[]> {
  const results: Result[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      const item = items[index];
      if (item !== undefined) {
        results[index] = await run(item);
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

/** One `cat-file --batch-check` instead of a `cat-file -s` per file. */
async function readBlobSizes(cwd: string, hashes: (string | null)[]) {
  const sizes = new Map<string, number>();
  const wanted = [...new Set(hashes.filter((hash): hash is string => !!hash))];
  if (wanted.length === 0) {
    return sizes;
  }
  const output = await runGitWithInput(["cat-file", "--batch-check"], {
    cwd,
    input: `${wanted.join("\n")}\n`,
  }).catch(() => "");
  for (const line of output.split("\n")) {
    const [hash, type, size] = line.trim().split(" ");
    if (hash && type === "blob" && size) {
      const parsed = Number(size);
      if (Number.isFinite(parsed)) {
        sizes.set(hash, parsed);
      }
    }
  }
  return sizes;
}

/**
 * Parses `git diff --raw -z` records:
 * `:<srcmode> <dstmode> <srcsha> <dstsha> <status>\0<path>[\0<newPath>]`.
 */
function parseRawDiff(output: string) {
  const tokens = output.split("\0").filter(Boolean);
  const entries: Array<{
    path: string;
    previousPath: string | null;
    operation: TurnFileOperation;
    beforeHash: string | null;
    afterHash: string | null;
  }> = [];
  const emptyHash = /^0+$/;
  for (let index = 0; index < tokens.length; index += 1) {
    const record = tokens[index] ?? "";
    if (!record.startsWith(":")) {
      continue;
    }
    const parts = record.slice(1).split(" ");
    const srcSha = parts[2] ?? "";
    const dstSha = parts[3] ?? "";
    const status = parts[4] ?? "";
    const code = status[0];
    const beforeHash = emptyHash.test(srcSha) ? null : srcSha;
    const afterHash = emptyHash.test(dstSha) ? null : dstSha;
    if (code === "R" || code === "C") {
      const previousPath = tokens[index + 1] ?? "";
      const pathName = tokens[index + 2] ?? "";
      index += 2;
      entries.push({
        path: pathName,
        previousPath,
        operation: "rename",
        beforeHash,
        afterHash,
      });
      continue;
    }
    const pathName = tokens[index + 1] ?? "";
    index += 1;
    const operation: TurnFileOperation =
      code === "A" ? "add" : code === "D" ? "delete" : "modify";
    entries.push({
      path: pathName,
      previousPath: null,
      operation,
      beforeHash,
      afterHash,
    });
  }
  return entries;
}

function parseNumstat(output: string) {
  const stats = new Map<
    string,
    { additions: number | null; deletions: number | null }
  >();
  for (const line of output.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    const [added, deleted, ...pathParts] = line.split("\t");
    const filePath = pathParts.join("\t").split(" => ").at(-1) ?? "";
    if (!filePath) {
      continue;
    }
    stats.set(filePath, {
      additions: added === "-" ? null : Number(added),
      deletions: deleted === "-" ? null : Number(deleted),
    });
  }
  return stats;
}

async function gitBlobSize(cwd: string, treeish: string, relativePath: string) {
  const output = await runGit(
    ["cat-file", "-s", `${treeish}:${relativePath}`],
    { cwd, allowFailure: true },
  );
  const size = Number(output.trim());
  return Number.isFinite(size) ? size : null;
}

async function gitBlobMode(cwd: string, treeish: string, relativePath: string) {
  const output = await runGit(["ls-tree", treeish, "--", relativePath], {
    cwd,
    allowFailure: true,
  });
  const match = output.match(/^(\d+)\s/);
  if (!match?.[1]) {
    return undefined;
  }
  return Number.parseInt(match[1].slice(-3), 8);
}

async function restoreGitPath(
  workspaceRootPath: string,
  commit: string,
  plan: RestorePathPlan,
) {
  await assertSafeRestorePlan(workspaceRootPath, plan);
  if (plan.operation === "add") {
    await removeWorkspaceFile(workspaceRootPath, plan.path);
    return;
  }

  const sourcePath = plan.previousPath ?? plan.path;
  const bytes = await readGitBlob(workspaceRootPath, commit, sourcePath);
  if (!bytes) {
    throw new Error("Checkpoint blob is unavailable");
  }
  const mode = await gitBlobMode(workspaceRootPath, commit, sourcePath);
  const targetPath = resolveWorkspacePath(
    workspaceRootPath,
    sourcePath,
  ).absolute;
  await writeFileAtomically(targetPath, bytes, {
    mode,
    workspaceRootPath,
    relativePath: sourcePath,
  });
  if (plan.operation === "rename") {
    await removeWorkspaceFile(workspaceRootPath, plan.path);
  }
}

async function readGitBlob(
  workspaceRootPath: string,
  commit: string,
  relativePath: string,
) {
  const size = await gitBlobSize(workspaceRootPath, commit, relativePath);
  if (size == null || size > MAX_CHECKPOINT_FILE_BYTES) {
    return null;
  }
  try {
    const stdout = await new Promise<Buffer>((resolve, reject) => {
      execFile(
        "git",
        ["cat-file", "-p", `${commit}:${relativePath}`],
        {
          cwd: workspaceRootPath,
          encoding: "buffer",
          maxBuffer: MAX_CHECKPOINT_FILE_BYTES + 1024,
        },
        (error, output) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(output as Buffer);
        },
      );
    });
    return stdout;
  } catch {
    return null;
  }
}
