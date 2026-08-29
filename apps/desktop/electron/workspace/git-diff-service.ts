import { open, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { SimpleGit } from "simple-git";
import type {
  GitBranchInfo,
  GitChangeKind,
  GitCommitInfo,
  GitFileStagedState,
  GitRefKind,
  WorkspaceGitDiffQuery,
  WorkspaceGitDiffResult,
  WorkspaceGitFileChange,
  WorkspaceGitStatusEntry,
  WorkspaceGitStatusResult,
  WorkspaceGitTreeStatus,
} from "@/lib/types";
import { createGitClient } from "./git-client";

// Cap for building an in-memory textual diff. A side larger than this is
// omitted (placeholder row) instead of shipping megabytes over IPC and parsing
// them synchronously in the renderer.
const MAX_DIFF_TEXT_BYTES = 1_000_000;

// git's well-known empty tree object, used as the diff base when HEAD is
// unborn (fresh repo without a first commit) so every file shows as added.
const EMPTY_TREE_HASH = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

const DEFAULT_COMMIT_LIMIT = 50;

type ContentSide =
  | { kind: "rev"; rev: string }
  | { kind: "index" }
  | { kind: "worktree" };

interface ResolvedDiffSpec {
  // Args for `git diff … --name-status` / `--numstat` (without those flags).
  diffArgs: string[];
  oldSide: ContentSide;
  newSide: ContentSide;
  includeUntracked: boolean;
  // When set, porcelain drives stagedState (working mode only).
  usePorcelainStagedState: boolean;
  defaultStagedState: GitFileStagedState;
}

export async function listGitBranches(
  rootPath: string,
): Promise<GitBranchInfo[]> {
  try {
    const git = createGitClient(rootPath);
    if (!(await git.checkIsRepo())) {
      return [];
    }
    // for-each-ref is stable and includes remotes; branchLocal alone misses
    // origin/* which branch-compare mode needs.
    const raw = await git.raw([
      "for-each-ref",
      "--format=%(refname)\t%(refname:short)\t%(HEAD)",
      "refs/heads",
      "refs/remotes",
    ]);
    const branches: GitBranchInfo[] = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      const [refname, shortName, headMark] = trimmed.split("\t");
      if (refname == null || shortName == null) continue;
      // Skip remote HEAD symbolic refs (e.g. origin/HEAD).
      if (refname.endsWith("/HEAD") || shortName.endsWith("/HEAD")) continue;
      const kind: GitRefKind = refname.startsWith("refs/remotes/")
        ? "remote"
        : "local";
      branches.push({
        name: shortName,
        current: headMark === "*",
        kind,
      });
    }
    // Detached HEAD: no local branch is current, so surface the checked-out
    // commit's short hash instead of leaving the toolbar on "no branch".
    if (!branches.some((branch) => branch.current)) {
      try {
        const short = (await git.revparse(["--short", "HEAD"])).trim();
        if (short) {
          branches.unshift({ name: short, current: true, kind: "detached" });
        }
      } catch {
        // Unborn HEAD (fresh repo): nothing is checked out yet.
      }
    }
    return branches;
  } catch {
    return [];
  }
}

export async function listGitCommits(
  rootPath: string,
  options: { limit?: number } = {},
): Promise<GitCommitInfo[]> {
  try {
    const git = createGitClient(rootPath);
    if (!(await git.checkIsRepo())) {
      return [];
    }
    if (!(await hasHeadCommit(git))) {
      return [];
    }
    const limit = Math.min(
      Math.max(options.limit ?? DEFAULT_COMMIT_LIMIT, 1),
      200,
    );
    // %x1f field sep, %x1e record sep — subjects can contain any printable char.
    const raw = await git.raw([
      "log",
      `-n${limit}`,
      "--format=%H%x1f%h%x1f%s%x1f%an%x1f%cI%x1e",
    ]);
    const commits: GitCommitInfo[] = [];
    for (const record of raw.split("\x1e")) {
      const trimmed = record.trim();
      if (trimmed.length === 0) continue;
      const [hash, shortHash, subject, authorName, committedAt] =
        trimmed.split("\x1f");
      if (
        hash == null ||
        shortHash == null ||
        subject == null ||
        authorName == null ||
        committedAt == null
      ) {
        continue;
      }
      commits.push({
        hash,
        shortHash,
        subject,
        authorName,
        committedAt,
      });
    }
    return commits;
  } catch {
    return [];
  }
}

// Lightweight working-tree status for the explorer file tree's built-in git
// signs. Porcelain only — never reads file contents (unlike getWorkspaceDiff).
export async function getWorkspaceGitStatus(
  rootPath: string,
): Promise<WorkspaceGitStatusResult> {
  try {
    const git = createGitClient(rootPath);
    if (!(await git.checkIsRepo())) {
      return { status: "not-a-repo", entries: [] };
    }
    const raw = await git.raw([
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
    ]);
    return { status: "ok", entries: parsePorcelainToGitStatusEntries(raw) };
  } catch {
    return { status: "error", entries: [] };
  }
}

// Parse `git status --porcelain=v1 -z` into pierre-compatible status entries.
// Exported for unit tests; rename/copy records consume the destination path
// (the name still present in the worktree listing).
export function parsePorcelainToGitStatusEntries(
  raw: string,
): WorkspaceGitStatusEntry[] {
  const entries: WorkspaceGitStatusEntry[] = [];
  const tokens = raw.split("\0");
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token == null || token.length === 0) {
      index += 1;
      continue;
    }
    // Status records are `XY path` (third character is a space).
    if (token.length < 3 || token[2] !== " ") {
      index += 1;
      continue;
    }
    const x = token[0] ?? " ";
    const y = token[1] ?? " ";
    let filePath = token.slice(3);
    const isRenameOrCopy = x === "R" || x === "C" || y === "R" || y === "C";
    if (isRenameOrCopy) {
      // With -z, the next token is the destination path (no XY prefix).
      const destination = tokens[index + 1];
      if (destination != null && destination.length > 0) {
        filePath = destination;
        index += 2;
      } else {
        index += 1;
      }
    } else {
      index += 1;
    }
    if (filePath.length === 0) continue;
    const status = mapPorcelainCodes(x, y);
    if (status == null) continue;
    entries.push({ path: filePath, status });
  }
  return entries;
}

// Collapse the index/worktree pair into a single tree badge. Prefer the more
// structural signal (rename/delete/add) over plain modification.
function mapPorcelainCodes(
  x: string,
  y: string,
): WorkspaceGitTreeStatus | null {
  if (x === "?" && y === "?") return "untracked";
  if (x === "!" && y === "!") return "ignored";
  // Unmerged / conflict markers surface as modified.
  if (
    x === "U" ||
    y === "U" ||
    (x === "A" && y === "A") ||
    (x === "D" && y === "D")
  ) {
    return "modified";
  }
  const codes = [x, y].filter((code) => code !== " " && code !== "?");
  if (codes.includes("R")) return "renamed";
  if (codes.includes("C")) return "added";
  if (codes.includes("D")) return "deleted";
  if (codes.includes("A")) return "added";
  if (codes.includes("M") || codes.includes("T")) return "modified";
  return null;
}

// Collect changed files as full old/new contents for the renderer. Returning
// whole files (instead of a unified patch) lets pierre build a non-partial
// diff so unchanged context can be expanded on demand. Renames are disabled
// so each change maps cleanly to a single file blob.
export async function getWorkspaceDiff(
  rootPath: string,
  query: WorkspaceGitDiffQuery = { mode: "working" },
): Promise<WorkspaceGitDiffResult> {
  try {
    const git = createGitClient(rootPath);
    if (!(await git.checkIsRepo())) {
      return { status: "not-a-repo", changes: [] };
    }
    const resolved = await resolveDiffSpec(git, query);
    if (resolved == null) {
      return { status: "error", changes: [] };
    }
    const nameStatusArgs = [
      ...resolved.diffArgs,
      "--no-renames",
      "--no-ext-diff",
      "-z",
      "--name-status",
    ];
    const numstatArgs = [
      ...resolved.diffArgs,
      "--no-renames",
      "--no-ext-diff",
      "-z",
      "--numstat",
    ];
    const [nameStatus, numstat, porcelain] = await Promise.all([
      git.raw(nameStatusArgs),
      git.raw(numstatArgs),
      resolved.includeUntracked || resolved.usePorcelainStagedState
        ? git.raw([
            "status",
            "--porcelain=v1",
            "--no-renames",
            "--untracked-files=all",
            "-z",
          ])
        : Promise.resolve(""),
    ]);
    const binaryPaths = parseBinaryNumstat(numstat);
    const stagedStates = resolved.usePorcelainStagedState
      ? parsePorcelainStagedStates(porcelain)
      : null;
    const untrackedPaths = resolved.includeUntracked
      ? parsePorcelainUntracked(porcelain)
      : [];
    if (untrackedPaths.length > 0) {
      await markBinaryUntracked(rootPath, untrackedPaths, binaryPaths);
    }
    // Tracked changes and untracked files come from separate git commands, so
    // sort the merged set by path to keep a stable order.
    const records = [
      ...parseNameStatus(nameStatus),
      ...untrackedPaths.map((filePath) => ({ status: "A", path: filePath })),
    ].sort((left, right) => left.path.localeCompare(right.path));
    const changes = await Promise.all(
      records.map((record) =>
        buildFileChange(
          rootPath,
          record,
          binaryPaths,
          stagedStates?.get(record.path) ?? resolved.defaultStagedState,
          resolved.oldSide,
          resolved.newSide,
        ),
      ),
    );
    return { status: "ok", changes };
  } catch {
    return { status: "error", changes: [] };
  }
}

async function resolveDiffSpec(
  git: SimpleGit,
  query: WorkspaceGitDiffQuery,
): Promise<ResolvedDiffSpec | null> {
  switch (query.mode) {
    case "working": {
      const diffBase = (await hasHeadCommit(git)) ? "HEAD" : EMPTY_TREE_HASH;
      return {
        diffArgs: ["diff", diffBase],
        oldSide: { kind: "rev", rev: diffBase },
        newSide: { kind: "worktree" },
        includeUntracked: true,
        usePorcelainStagedState: true,
        defaultStagedState: "unstaged",
      };
    }
    case "unstaged":
      return {
        // Worktree vs index (no rev): the classic unstaged patch.
        diffArgs: ["diff"],
        oldSide: { kind: "index" },
        newSide: { kind: "worktree" },
        includeUntracked: true,
        usePorcelainStagedState: false,
        defaultStagedState: "unstaged",
      };
    case "staged": {
      const diffBase = (await hasHeadCommit(git)) ? "HEAD" : EMPTY_TREE_HASH;
      return {
        diffArgs: ["diff", "--cached", diffBase],
        oldSide: { kind: "rev", rev: diffBase },
        newSide: { kind: "index" },
        includeUntracked: false,
        usePorcelainStagedState: false,
        defaultStagedState: "staged",
      };
    }
    case "commit": {
      const commit = query.commit.trim();
      if (commit.length === 0) return null;
      if (!(await revExists(git, commit))) return null;
      const parent = await resolveFirstParent(git, commit);
      return {
        diffArgs: ["diff", parent, commit],
        oldSide: { kind: "rev", rev: parent },
        newSide: { kind: "rev", rev: commit },
        includeUntracked: false,
        usePorcelainStagedState: false,
        defaultStagedState: "unstaged",
      };
    }
    case "branch": {
      // UI: source (left) → target (right). Diff is what source introduces
      // relative to target: three-dot `target...source` (= merge-base..source).
      const source = query.source.trim();
      const target = query.target.trim();
      if (source.length === 0 || target.length === 0) return null;
      if (!(await revExists(git, source)) || !(await revExists(git, target))) {
        return null;
      }
      const mergeBase = await resolveMergeBase(git, target, source);
      return {
        diffArgs: ["diff", `${target}...${source}`],
        oldSide: { kind: "rev", rev: mergeBase },
        newSide: { kind: "rev", rev: source },
        includeUntracked: false,
        usePorcelainStagedState: false,
        defaultStagedState: "unstaged",
      };
    }
    default:
      return null;
  }
}

async function resolveMergeBase(
  git: SimpleGit,
  base: string,
  target: string,
): Promise<string> {
  try {
    const mergeBase = (await git.raw(["merge-base", base, target])).trim();
    return mergeBase.length > 0 ? mergeBase : EMPTY_TREE_HASH;
  } catch {
    return EMPTY_TREE_HASH;
  }
}

async function revExists(git: SimpleGit, rev: string): Promise<boolean> {
  try {
    await git.raw(["rev-parse", "--verify", "--quiet", `${rev}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

async function resolveFirstParent(
  git: SimpleGit,
  commit: string,
): Promise<string> {
  try {
    const parent = (
      await git.raw(["rev-parse", "--verify", "--quiet", `${commit}^`])
    ).trim();
    return parent.length > 0 ? parent : EMPTY_TREE_HASH;
  } catch {
    return EMPTY_TREE_HASH;
  }
}

async function hasHeadCommit(git: SimpleGit) {
  try {
    await git.raw(["rev-parse", "--verify", "--quiet", "HEAD"]);
    return true;
  } catch {
    return false;
  }
}

function parsePorcelainStagedStates(
  raw: string,
): Map<string, GitFileStagedState> {
  const states = new Map<string, GitFileStagedState>();
  for (const entry of raw.split("\0")) {
    if (entry.length < 4) continue;
    const x = entry[0];
    const y = entry[1];
    const filePath = entry.slice(3);
    const indexChanged = x !== " " && x !== "?";
    const worktreeChanged = y !== " ";
    if (indexChanged && worktreeChanged) {
      states.set(filePath, "partial");
    } else if (indexChanged) {
      states.set(filePath, "staged");
    } else if (worktreeChanged) {
      states.set(filePath, "unstaged");
    }
  }
  return states;
}

function parsePorcelainUntracked(raw: string): string[] {
  const paths: string[] = [];
  for (const entry of raw.split("\0")) {
    if (entry.length < 4) continue;
    if (entry[0] === "?" && entry[1] === "?") {
      paths.push(entry.slice(3));
    }
  }
  return paths;
}

async function markBinaryUntracked(
  rootPath: string,
  untrackedPaths: string[],
  binaryPaths: Set<string>,
): Promise<void> {
  await Promise.all(
    untrackedPaths.map(async (filePath) => {
      let handle: Awaited<ReturnType<typeof open>> | null = null;
      try {
        handle = await open(path.join(rootPath, filePath), "r");
        const buffer = Buffer.alloc(8000);
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        if (buffer.subarray(0, bytesRead).includes(0)) {
          binaryPaths.add(filePath);
        }
      } catch {
        // Unreadable file: leave it out of the binary set.
      } finally {
        await handle?.close().catch(() => {});
      }
    }),
  );
}

interface NameStatusRecord {
  status: string;
  path: string;
}

function parseNameStatus(raw: string): NameStatusRecord[] {
  const tokens = raw.split("\0").filter((token) => token.length > 0);
  const records: NameStatusRecord[] = [];
  let index = 0;
  while (index < tokens.length) {
    const status = tokens[index++];
    if (status == null) break;
    if (status[0] === "R" || status[0] === "C") {
      index++; // Skip the rename/copy source path.
    }
    const filePath = tokens[index++];
    if (filePath == null) break;
    records.push({ status: status[0] ?? "", path: filePath });
  }
  return records;
}

function parseBinaryNumstat(raw: string): Set<string> {
  const binary = new Set<string>();
  for (const chunk of raw.split("\0")) {
    if (chunk.length === 0) continue;
    const [added, , filePath] = chunk.split("\t");
    if (added === "-" && filePath != null) binary.add(filePath);
  }
  return binary;
}

function toChangeKind(status: string): GitChangeKind {
  if (status === "A") return "added";
  if (status === "D") return "deleted";
  return "modified";
}

async function buildFileChange(
  rootPath: string,
  record: NameStatusRecord,
  binaryPaths: Set<string>,
  stagedState: GitFileStagedState,
  oldSide: ContentSide,
  newSide: ContentSide,
): Promise<WorkspaceGitFileChange> {
  const { status, path: filePath } = record;
  const changeType = toChangeKind(status);
  if (binaryPaths.has(filePath)) {
    return {
      path: filePath,
      changeType,
      oldContents: "",
      newContents: "",
      omittedReason: "binary",
      stagedState,
    };
  }
  // Added files have no old blob; deleted files have no new blob.
  const [oldContents, newContents] = await Promise.all([
    status === "A"
      ? Promise.resolve("")
      : readContentSide(rootPath, filePath, oldSide),
    status === "D"
      ? Promise.resolve("")
      : readContentSide(rootPath, filePath, newSide),
  ]);
  if (oldContents == null || newContents == null) {
    return {
      path: filePath,
      changeType,
      oldContents: "",
      newContents: "",
      omittedReason: "too-large",
      stagedState,
    };
  }
  return {
    path: filePath,
    changeType,
    oldContents,
    newContents,
    omittedReason: null,
    stagedState,
  };
}

async function readContentSide(
  rootPath: string,
  filePath: string,
  side: ContentSide,
): Promise<string | null> {
  switch (side.kind) {
    case "worktree":
      return readWorkingFile(rootPath, filePath);
    case "index":
      return readIndexBlob(rootPath, filePath);
    case "rev":
      return readRevBlob(rootPath, side.rev, filePath);
  }
}

async function readRevBlob(
  rootPath: string,
  rev: string,
  filePath: string,
): Promise<string | null> {
  try {
    const contents = await createGitClient(rootPath).show([
      `${rev}:${filePath}`,
    ]);
    return contents.length > MAX_DIFF_TEXT_BYTES ? null : contents;
  } catch {
    return "";
  }
}

async function readIndexBlob(
  rootPath: string,
  filePath: string,
): Promise<string | null> {
  try {
    // `:path` is the index stage-0 blob. Missing path → empty (new untracked
    // or never staged).
    const contents = await createGitClient(rootPath).show([`:${filePath}`]);
    return contents.length > MAX_DIFF_TEXT_BYTES ? null : contents;
  } catch {
    return "";
  }
}

async function readWorkingFile(
  rootPath: string,
  filePath: string,
): Promise<string | null> {
  try {
    const absolutePath = path.join(rootPath, filePath);
    const stats = await stat(absolutePath);
    if (stats.size > MAX_DIFF_TEXT_BYTES) {
      return null;
    }
    return await readFile(absolutePath, "utf8");
  } catch {
    return "";
  }
}
