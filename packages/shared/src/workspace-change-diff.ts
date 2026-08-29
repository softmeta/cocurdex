import { inferReviewKind } from "./workspace-change-review";
import type {
  NativeWorkspaceChangeEvidence,
  TurnFileChange,
  TurnFileOperation,
  WorkspaceChangeCoverage,
  WorkspaceChangeSource,
} from "./workspace-changes";

export { inferReviewKind, mimeTypeForPath } from "./workspace-change-review";

export function createUnifiedDiff(
  relativePath: string,
  oldText: string,
  newText: string,
): { patch: string; additions: number; deletions: number } {
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);
  const prefix = commonPrefixLength(oldLines, newLines);
  const suffix = commonSuffixLength(oldLines, newLines, prefix);
  const oldHunk = oldLines.slice(prefix, oldLines.length - suffix);
  const newHunk = newLines.slice(prefix, newLines.length - suffix);
  const additions = newHunk.length;
  const deletions = oldHunk.length;
  const oldStart = prefix + 1;
  const newStart = prefix + 1;
  const hunkHeader = `@@ -${oldStart},${oldHunk.length} +${newStart},${newHunk.length} @@`;
  const hunkLines = [
    hunkHeader,
    ...oldHunk.map((line) => `-${line}`),
    ...newHunk.map((line) => `+${line}`),
  ];
  const patch = [
    `--- a/${relativePath}`,
    `+++ b/${relativePath}`,
    ...hunkLines,
  ].join("\n");
  return { patch, additions, deletions };
}

export function parseUnifiedDiff(diff: string): TurnFileChange[] {
  const files: TurnFileChange[] = [];
  const sections = splitDiffSections(diff);
  for (const section of sections) {
    const parsed = parseDiffSection(section);
    if (parsed) {
      files.push(parsed);
    }
  }
  return aggregateTurnFileChanges(files);
}

function splitDiffSections(diff: string) {
  const normalized = diff.replace(/\r\n/g, "\n");
  if (!normalized.trim()) {
    return [];
  }
  const matches = [...normalized.matchAll(/^diff --git .+$|^--- .+$/gm)];
  if (matches.length === 0) {
    return [normalized];
  }
  const starts: number[] = [];
  for (const match of matches) {
    const index = match.index;
    if (index == null) {
      continue;
    }
    if (
      match[0].startsWith("--- ") &&
      starts.some((start) => start < index && index - start < 80)
    ) {
      continue;
    }
    starts.push(index);
  }
  if (starts.length === 0) {
    return [normalized];
  }
  return starts.map((start, index) =>
    normalized.slice(start, starts[index + 1]),
  );
}

function parseDiffSection(section: string): TurnFileChange | null {
  const gitMatch = section.match(/^diff --git a\/(.+?) b\/(.+)$/m);
  const oldMatch = section.match(/^--- (?:a\/)?(.+)$/m);
  const newMatch = section.match(/^\+\+\+ (?:b\/)?(.+)$/m);
  const oldPath = normalizeDiffPath(gitMatch?.[1] ?? oldMatch?.[1]);
  const newPath = normalizeDiffPath(gitMatch?.[2] ?? newMatch?.[1]);
  if (!oldPath && !newPath) {
    return null;
  }

  const isAdd = oldPath === "/dev/null" || section.includes("new file mode");
  const isDelete =
    newPath === "/dev/null" || section.includes("deleted file mode");
  const isRename =
    Boolean(oldPath && newPath && oldPath !== newPath) && !isAdd && !isDelete;
  let operation: TurnFileOperation = "modify";
  if (isAdd) {
    operation = "add";
  } else if (isDelete) {
    operation = "delete";
  } else if (isRename) {
    operation = "rename";
  }

  const path = (isDelete ? oldPath : newPath) || oldPath || newPath;
  if (!path || path === "/dev/null") {
    return null;
  }

  let additions = 0;
  let deletions = 0;
  for (const line of section.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) {
      continue;
    }
    if (line.startsWith("+")) {
      additions += 1;
    } else if (line.startsWith("-")) {
      deletions += 1;
    }
  }

  return {
    path,
    previousPath: isRename ? oldPath : null,
    operation,
    reviewKind: inferReviewKind(path),
    additions,
    deletions,
    patch: section.trimEnd(),
  };
}

function normalizeDiffPath(value: string | undefined) {
  if (!value) {
    return null;
  }
  const trimmed = value.replace(/\t.*$/, "").trim();
  if (trimmed === "/dev/null") {
    return "/dev/null";
  }
  return trimmed.replace(/^a\//, "").replace(/^b\//, "");
}

export function aggregateTurnFileChanges(
  files: TurnFileChange[],
): TurnFileChange[] {
  const byPath = new Map<string, TurnFileChange>();
  for (const file of files) {
    const existing = byPath.get(file.path);
    if (!existing) {
      byPath.set(file.path, { ...file });
      continue;
    }
    byPath.set(file.path, mergeSamePath(existing, file));
  }
  return [...byPath.values()].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
}

function mergeSamePath(
  first: TurnFileChange,
  next: TurnFileChange,
): TurnFileChange {
  const operation = netOperation(first.operation, next.operation);
  return {
    path: next.path,
    previousPath: next.previousPath ?? first.previousPath ?? null,
    operation,
    reviewKind: next.reviewKind,
    additions: sumNullable(first.additions, next.additions),
    deletions: sumNullable(first.deletions, next.deletions),
    patch: next.patch ?? first.patch ?? null,
    beforeHash: first.beforeHash ?? next.beforeHash ?? null,
    afterHash: next.afterHash ?? first.afterHash ?? null,
    beforeSize: first.beforeSize ?? next.beforeSize ?? null,
    afterSize: next.afterSize ?? first.afterSize ?? null,
  };
}

function netOperation(
  first: TurnFileOperation,
  next: TurnFileOperation,
): TurnFileOperation {
  if (first === "add" && next === "delete") {
    return "delete";
  }
  if (first === "delete" && next === "add") {
    return "modify";
  }
  if (first === "add") {
    return "add";
  }
  return next;
}

export function nativeMatchesHostTransition(
  native: TurnFileChange,
  host: TurnFileChange,
) {
  if (
    native.operation !== host.operation ||
    (native.previousPath ?? null) !== (host.previousPath ?? null)
  ) {
    return false;
  }
  if (native.operation === "add") {
    return (
      native.afterHash != null &&
      host.afterHash != null &&
      native.afterHash === host.afterHash
    );
  }
  if (native.operation === "delete") {
    return (
      native.beforeHash != null &&
      host.beforeHash != null &&
      native.beforeHash === host.beforeHash
    );
  }
  return (
    native.beforeHash != null &&
    native.afterHash != null &&
    native.beforeHash === host.beforeHash &&
    native.afterHash === host.afterHash
  );
}

export function mergeNativeAndHostEvidence(
  native: TurnFileChange[] | null | undefined,
  host: TurnFileChange[],
  hostAvailable = false,
): TurnFileChange[] {
  if (!hostAvailable) {
    return [...(native ?? [])].sort((left, right) =>
      left.path.localeCompare(right.path),
    );
  }

  const byPath = new Map<string, TurnFileChange>();
  for (const file of host) {
    byPath.set(file.path, { ...file });
  }

  if (!native || native.length === 0) {
    return [...byPath.values()].sort((left, right) =>
      left.path.localeCompare(right.path),
    );
  }

  const hostByPrevious = new Map<string, TurnFileChange>();
  for (const file of host) {
    if (file.previousPath) {
      hostByPrevious.set(file.previousPath, file);
    }
  }

  for (const file of native) {
    const renamed = hostByPrevious.get(file.path);
    if (renamed && file.operation === "delete") {
      continue;
    }
    const existing = byPath.get(file.path);
    if (!existing || !nativeMatchesHostTransition(file, existing)) {
      continue;
    }
    byPath.set(file.path, {
      ...existing,
      additions: file.additions ?? existing.additions ?? null,
      deletions: file.deletions ?? existing.deletions ?? null,
      patch: file.patch ?? existing.patch ?? null,
      reviewKind:
        file.reviewKind === "text" ? existing.reviewKind : file.reviewKind,
    });
  }

  return [...byPath.values()].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
}

export function sumFileStats(files: TurnFileChange[]) {
  let additions = 0;
  let deletions = 0;
  let hasAdditions = false;
  let hasDeletions = false;
  for (const file of files) {
    if (typeof file.additions === "number") {
      additions += file.additions;
      hasAdditions = true;
    }
    if (typeof file.deletions === "number") {
      deletions += file.deletions;
      hasDeletions = true;
    }
  }
  return {
    additions: hasAdditions ? additions : null,
    deletions: hasDeletions ? deletions : null,
  };
}

export function selectChangeSetSource(
  native: NativeWorkspaceChangeEvidence | null | undefined,
  hostSource: Extract<
    WorkspaceChangeSource,
    "git-checkpoint" | "filesystem-checkpoint"
  > | null,
): WorkspaceChangeSource {
  return native?.source ?? hostSource ?? "filesystem-checkpoint";
}

export function selectChangeSetCoverage(
  native: NativeWorkspaceChangeEvidence | null | undefined,
  hostAvailable: boolean,
): WorkspaceChangeCoverage {
  if (hostAvailable) {
    return "workspace";
  }
  return native?.coverage ?? "tool-call";
}

function splitLines(value: string) {
  if (value.length === 0) {
    return [];
  }
  return value.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
}

function commonPrefixLength(left: string[], right: string[]) {
  const limit = Math.min(left.length, right.length);
  let index = 0;
  while (index < limit && left[index] === right[index]) {
    index += 1;
  }
  return index;
}

function commonSuffixLength(left: string[], right: string[], prefix: number) {
  const leftRemaining = left.length - prefix;
  const rightRemaining = right.length - prefix;
  const limit = Math.min(leftRemaining, rightRemaining);
  let index = 0;
  while (
    index < limit &&
    left[left.length - 1 - index] === right[right.length - 1 - index]
  ) {
    index += 1;
  }
  return index;
}

function sumNullable(left?: number | null, right?: number | null) {
  if (typeof left !== "number" && typeof right !== "number") {
    return null;
  }
  return (left ?? 0) + (right ?? 0);
}
