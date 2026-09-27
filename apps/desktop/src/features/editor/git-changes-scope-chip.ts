import type { TurnChangeSet } from "@cocurdex/shared";
import type { GitCommitInfo } from "@/lib";
import { turnChangeSetKey } from "./git-diff-scope";

// Narrow helper so the toolbar can render the scope chip without importing
// translation keys elsewhere.
export function formatCommitChip(
  commits: readonly GitCommitInfo[],
  commit: string,
): { shortHash: string; subject: string } {
  const match = commits.find(
    (entry) => entry.hash === commit || entry.shortHash === commit,
  );
  if (match) {
    return { shortHash: match.shortHash, subject: match.subject };
  }
  return {
    shortHash: commit.length > 7 ? commit.slice(0, 7) : commit,
    subject: "",
  };
}

export function formatTurnChip(
  turns: readonly TurnChangeSet[],
  messageId: string,
  turnLabels: Record<string, string>,
  t: (key: "git.turnFiles", options: { count: number }) => string,
): string {
  const match = turns.find((turn) => turnChangeSetKey(turn) === messageId);
  if (!match) {
    return turnLabels[messageId] ?? "";
  }
  const key = turnChangeSetKey(match);
  return turnLabels[key] || t("git.turnFiles", { count: match.files.length });
}
