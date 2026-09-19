import type { TurnChangeDiffFile } from "@cocurdex/shared";
import {
  type DiffsThemeNames,
  type FileDiffMetadata,
  getFiletypeFromFileName,
  type Hunk,
  parseDiffFromFile,
  type SupportedLanguages,
} from "@pierre/diffs";
import type { GitStatusEntry } from "@pierre/trees";
import type {
  GitChangeKind,
  GitContentsOmittedReason,
  GitFileStagedState,
  WorkspaceGitFileChange,
} from "@/lib";

// A changed file ready to render: either a full (non-partial) diff that pierre
// can expand on demand, or a placeholder row when contents were omitted
// (binary, oversized, or unparsable).
export interface GitChangeEntry {
  path: string;
  changeType: GitChangeKind;
  diff: FileDiffMetadata | null;
  omittedReason: GitContentsOmittedReason | "unsupported" | null;
  stagedState: GitFileStagedState;
  additions: number;
  deletions: number;
}

export type GitChangeTypeFilter = "all" | GitChangeKind;

export type GitChangeTypeCounts = Record<GitChangeTypeFilter, number>;

// Turn raw file changes into renderable entries. Non-omitted files are diffed
// from their full old/new contents so the result is non-partial (expandable).
export function toGitFileChangesFromTurn(
  files: TurnChangeDiffFile[],
): WorkspaceGitFileChange[] {
  return files.map((file) => ({
    path: file.path,
    changeType: file.changeType,
    oldContents: file.oldContents,
    newContents: file.newContents,
    omittedReason: file.omittedReason,
    stagedState: "unstaged",
  }));
}

function contentDigest(contents: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < contents.length; index += 1) {
    hash ^= contents.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${contents.length.toString(36)}-${(hash >>> 0).toString(36)}`;
}

// Pierre decides whether a diff needs re-rendering by comparing `cacheKey`, so
// the key has to change whenever the parsed contents do — a key built from the
// path alone makes an edited file look unchanged and its body stays empty.
export function diffCacheKey(path: string, contents: string): string {
  return `${path}:${contentDigest(contents)}`;
}

// The file tree sorts each level with folders first, then dot-prefixed items,
// then a case-insensitive name comparison. The diff stack has to read in the
// same order, so it walks both paths one segment at a time under that rule.
function isDotPrefixed(name: string): boolean {
  return name.charCodeAt(0) === 46;
}

function compareTreeSegments(a: string[], b: string[]): number {
  const shared = Math.min(a.length, b.length);
  for (let index = 0; index < shared; index += 1) {
    const aName = a[index];
    const bName = b[index];
    if (aName === undefined || bName === undefined) continue;
    if (aName === bName) continue;
    const aIsFolder = a.length > index + 1;
    const bIsFolder = b.length > index + 1;
    if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1;
    if (isDotPrefixed(aName) !== isDotPrefixed(bName)) {
      return isDotPrefixed(aName) ? -1 : 1;
    }
    return aName.toLowerCase().localeCompare(bName.toLowerCase());
  }
  return a.length - b.length;
}

export function sortEntriesInTreeOrder<T extends { path: string }>(
  entries: T[],
): T[] {
  return [...entries].sort((a, b) =>
    compareTreeSegments(a.path.split("/"), b.path.split("/")),
  );
}

// Cache identity for one rendered row. The virtualizer keys measured heights by
// this, so anything that changes how tall the row renders — the diff's own
// identity, the fold state, or the display options — has to be part of it.
// Without the diff identity a reload with new contents kept the old measured
// height and shifted the whole list when the row re-mounted.
export function entryItemKey(
  entry: GitChangeEntry,
  options: {
    folded: boolean;
    diffStyle: GitDiffStyleName;
    wrap: boolean;
    expandUnchanged: boolean;
  },
): string {
  const state = options.folded ? "folded" : "open";
  const content = entry.diff?.cacheKey ?? entry.omittedReason ?? "unparsed";
  const display = `${options.diffStyle}:${options.wrap ? "wrap" : "scroll"}:${options.expandUnchanged ? "all" : "hunks"}`;
  return `${content}:${state}:${display}`;
}

export function buildEntries(
  fileChanges: WorkspaceGitFileChange[],
): GitChangeEntry[] {
  return sortEntriesInTreeOrder(
    fileChanges.map((change): GitChangeEntry => {
      const { path, changeType, stagedState } = change;
      if (change.omittedReason) {
        return {
          path,
          changeType,
          diff: null,
          omittedReason: change.omittedReason,
          stagedState,
          additions: 0,
          deletions: 0,
        };
      }
      try {
        const diff = parseDiffFromFile(
          {
            cacheKey: diffCacheKey(change.path, change.oldContents),
            contents: change.oldContents,
            name: change.path,
          },
          {
            cacheKey: diffCacheKey(change.path, change.newContents),
            contents: change.newContents,
            name: change.path,
          },
        );
        const { additions, deletions } = sumHunks(diff);
        return {
          path,
          changeType,
          diff,
          omittedReason: null,
          stagedState,
          additions,
          deletions,
        };
      } catch {
        // A parse failure shouldn't drop the file from the list entirely.
        return {
          path,
          changeType,
          diff: null,
          omittedReason: "unsupported" as const,
          stagedState,
          additions: 0,
          deletions: 0,
        };
      }
    }),
  );
}

// Sum added / removed line counts straight from a file's parsed hunks.
function sumHunks(diff: FileDiffMetadata): {
  additions: number;
  deletions: number;
} {
  let additions = 0;
  let deletions = 0;
  for (const hunk of diff.hunks) {
    additions += hunk.additionLines;
    deletions += hunk.deletionLines;
  }
  return { additions, deletions };
}

const EMPTY_CHANGE_TYPE_COUNTS: GitChangeTypeCounts = {
  all: 0,
  added: 0,
  modified: 0,
  deleted: 0,
};

export function filterEntriesByChangeType(
  entries: GitChangeEntry[],
  filter: GitChangeTypeFilter,
): GitChangeEntry[] {
  if (filter === "all") return entries;
  return entries.filter((entry) => entry.changeType === filter);
}

export function computeChangeTypeCounts(
  entries: GitChangeEntry[],
): GitChangeTypeCounts {
  const counts = { ...EMPTY_CHANGE_TYPE_COUNTS };
  for (const entry of entries) {
    counts.all += 1;
    counts[entry.changeType] += 1;
  }
  return counts;
}

// Aggregate the per-file counts for the toolbar's overall summary.
export function computeDiffStats(entries: GitChangeEntry[]): {
  additions: number;
  deletions: number;
} {
  let additions = 0;
  let deletions = 0;
  for (const entry of entries) {
    additions += entry.additions;
    deletions += entry.deletions;
  }
  return { additions, deletions };
}

export function computeStagedState(
  entries: GitChangeEntry[],
): GitFileStagedState {
  if (entries.length === 0) return "unstaged";
  const first = entries[0]?.stagedState ?? "unstaged";
  return entries.every((entry) => entry.stagedState === first)
    ? first
    : "partial";
}

// Height of one stacked file card before it has ever been painted: the card's
// borders, the header band, and the gap that separates it from the next card.
export const COLLAPSED_ENTRY_HEIGHT = 42;

export const GIT_DIFF_THEMES = {
  dark: "pierre-dark",
  light: "pierre-light",
} as const;

export const GIT_DIFF_THEME_NAMES: DiffsThemeNames[] = [
  GIT_DIFF_THEMES.dark,
  GIT_DIFF_THEMES.light,
];

// Pierre can only render a diff synchronously once its highlighter holds the
// diff's language; a body rendered before that is left empty, so a row that
// mounts a diff has to wait for this language to load.
export function entryLanguage(entry: GitChangeEntry): SupportedLanguages {
  return entry.diff?.lang ?? getFiletypeFromFileName(entry.path);
}

// Pierre renders diff rows at its 20px `--diffs-line-height`, collapses every
// unchanged gap wider than one line into a fixed 32px `line-info-basic`
// separator, and pads a header-less diff body by `--diffs-gap-block`, which
// this app sets to 2px.
type GitDiffStyleName = "unified" | "split";

export const DIFF_GAP_BLOCK = 2;

const DIFF_LINE_HEIGHT = 20;
const HUNK_SEPARATOR_HEIGHT = 32;
const COLLAPSED_CONTEXT_THRESHOLD = 1;

function hunkLineCount(hunk: Hunk, diffStyle: GitDiffStyleName): number {
  return diffStyle === "split" ? hunk.splitLineCount : hunk.unifiedLineCount;
}

function gapHeight(lines: number, expanded: boolean): number {
  if (lines <= 0) return 0;
  if (expanded || lines <= COLLAPSED_CONTEXT_THRESHOLD) {
    return lines * DIFF_LINE_HEIGHT;
  }
  return HUNK_SEPARATOR_HEIGHT;
}

function hunkSideEndBoundary(start: number, count: number): number {
  return start + count - (count === 0 ? 0 : 1);
}

function trailingGapLines(diff: FileDiffMetadata): number {
  const lastHunk = diff.hunks.at(-1);
  if (diff.isPartial || lastHunk == null) return 0;
  if (diff.additionLines.length === 0 || diff.deletionLines.length === 0) {
    return 0;
  }
  const additions =
    diff.additionLines.length -
    hunkSideEndBoundary(lastHunk.additionStart, lastHunk.additionCount);
  const deletions =
    diff.deletionLines.length -
    hunkSideEndBoundary(lastHunk.deletionStart, lastHunk.deletionCount);
  if (additions <= 0 || deletions <= 0) return 0;
  return Math.min(additions, deletions);
}

function noNewlineRows(hunk: Hunk, diffStyle: GitDiffStyleName): number {
  if (!hunk.noEOFCRAdditions && !hunk.noEOFCRDeletions) return 0;
  const last = hunk.hunkContent.at(-1);
  if (last == null) return 0;
  if (last.type === "context") return last.lines > 0 ? 1 : 0;
  const deletionRow = last.deletions > 0 && hunk.noEOFCRDeletions;
  const additionRow = last.additions > 0 && hunk.noEOFCRAdditions;
  if (diffStyle === "split") return deletionRow || additionRow ? 1 : 0;
  return (deletionRow ? 1 : 0) + (additionRow ? 1 : 0);
}

// Height a file's card occupies before the stack has measured it: the card
// chrome plus the rows pierre will paint for the file's current expansion
// state, so the whole change set can be laid out up front and opening a file
// does not move the rows around it.
export function estimateEntryHeight(
  entry: GitChangeEntry,
  options: {
    collapsed: boolean;
    expandUnchanged: boolean;
    diffStyle: GitDiffStyleName;
  },
): number {
  const { diff } = entry;
  if (options.collapsed || diff == null) return COLLAPSED_ENTRY_HEIGHT;
  const { diffStyle } = options;
  const gapsExpanded = options.expandUnchanged && !diff.isPartial;
  let content = DIFF_GAP_BLOCK * 2;
  for (const hunk of diff.hunks) {
    content += gapHeight(hunk.collapsedBefore, gapsExpanded);
    content += hunkLineCount(hunk, diffStyle) * DIFF_LINE_HEIGHT;
    content += noNewlineRows(hunk, diffStyle) * DIFF_LINE_HEIGHT;
  }
  content += gapHeight(trailingGapLines(diff), gapsExpanded);
  return COLLAPSED_ENTRY_HEIGHT + content;
}

export function entriesToGitStatus(
  entries: GitChangeEntry[],
): GitStatusEntry[] {
  return entries.map((entry) => ({
    path: entry.path,
    status: entry.changeType,
  }));
}
