import { type FileDiffMetadata, parseDiffFromFile } from "@pierre/diffs";
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
export function buildEntries(
  fileChanges: WorkspaceGitFileChange[],
): GitChangeEntry[] {
  return fileChanges.map((change) => {
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
          cacheKey: change.path,
          contents: change.oldContents,
          name: change.path,
        },
        {
          cacheKey: change.path,
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
  });
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

export function entriesToGitStatus(
  entries: GitChangeEntry[],
): GitStatusEntry[] {
  return entries.map((entry) => ({
    path: entry.path,
    status: entry.changeType,
  }));
}
