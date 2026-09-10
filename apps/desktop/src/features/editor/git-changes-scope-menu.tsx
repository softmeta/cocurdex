import type { TurnChangeSet } from "@cocurdex/shared";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  AppDropdownRadioList,
  AppDropdownTriggerButton,
  AppDropdownTriggerLabel,
} from "@/components";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { GitCommitInfo } from "@/lib";
import { type GitDiffScope, turnChangeSetKey } from "./git-diff-scope";

const TOP_LEVEL_MODES = [
  "unstaged",
  "staged",
  "working",
  "branch",
] as const satisfies readonly Exclude<
  GitDiffScope["mode"],
  "commit" | "turn"
>[];

interface GitChangesScopeMenuProps {
  scope: GitDiffScope;
  commits: readonly GitCommitInfo[];
  commitsLoading: boolean;
  sessionId: string | null;
  turnLabels: Record<string, string>;
  turns: readonly TurnChangeSet[];
  turnsLoading: boolean;
  disabled?: boolean;
  onScopeChange: (scope: GitDiffScope) => void;
  onOpenCommits: () => void;
  onOpenTurns: () => void;
}

export function GitChangesScopeMenu({
  scope,
  commits,
  commitsLoading,
  sessionId,
  turnLabels,
  turns,
  turnsLoading,
  disabled = false,
  onScopeChange,
  onOpenCommits,
  onOpenTurns,
}: GitChangesScopeMenuProps) {
  const { t } = useTranslation("editor");
  const triggerLabel = t(`git.scope.${scope.mode}`);
  const commitSelected = scope.mode === "commit";
  const turnSelected = scope.mode === "turn";
  const modeValue = commitSelected || turnSelected ? "" : scope.mode;
  const selectedCommit =
    scope.mode === "commit"
      ? (commits.find(
          (commit) =>
            commit.hash === scope.commit || commit.shortHash === scope.commit,
        )?.hash ?? scope.commit)
      : "";
  const selectedTurn = scope.mode === "turn" ? scope.messageId : "";

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) {
          onOpenCommits();
          onOpenTurns();
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <AppDropdownTriggerButton
          appearance="ghost"
          aria-label={t("git.scopeMenu")}
          className="app-no-drag h-7 max-w-44"
          disabled={disabled}
        >
          <AppDropdownTriggerLabel>{triggerLabel}</AppDropdownTriggerLabel>
        </AppDropdownTriggerButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        <AppDropdownRadioList
          value={modeValue}
          onValueChange={(mode) => {
            if (mode === "branch") {
              // Parent resolves source/target from refs; placeholder
              // values are replaced immediately on selection.
              onScopeChange({
                mode: "branch",
                source: "",
                target: "",
              });
              return;
            }
            onScopeChange({
              mode: mode as Exclude<
                GitDiffScope["mode"],
                "commit" | "branch" | "turn"
              >,
            });
          }}
          options={TOP_LEVEL_MODES.map((mode) => ({
            value: mode,
            label: t(`git.scope.${mode}`),
          }))}
        />
        {/* Sub sits outside the radio list so Base UI treats it as a sibling. */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <span className="truncate">{t("git.scope.commit")}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-72 min-w-64 max-w-96">
            {commitsLoading && commits.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                {t("git.loadingCommits")}
              </div>
            ) : null}
            {!commitsLoading && commits.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                {t("git.noCommits")}
              </div>
            ) : null}
            {commits.length > 0 ? (
              <DropdownMenuRadioGroup
                value={selectedCommit}
                onValueChange={(hash) =>
                  onScopeChange({
                    mode: "commit",
                    commit: hash,
                  })
                }
              >
                {commits.map((commit) => (
                  <DropdownMenuRadioItem
                    key={commit.hash}
                    value={commit.hash}
                    className="gap-2"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {commit.subject}
                    </span>
                    <span className="shrink-0 font-mono text-2xs text-muted-foreground">
                      {commit.shortHash}
                    </span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            ) : null}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <span className="truncate">{t("git.scope.turn")}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-72 min-w-64 max-w-96">
            {turnsLoading && turns.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                {t("git.loadingTurns")}
              </div>
            ) : null}
            {!turnsLoading && turns.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                {t("git.noTurns")}
              </div>
            ) : null}
            {turns.length > 0 ? (
              <DropdownMenuRadioGroup
                value={selectedTurn}
                onValueChange={(messageId) =>
                  onScopeChange({
                    mode: "turn",
                    sessionId: sessionId ?? "",
                    messageId,
                  })
                }
              >
                {turns.map((turn) => {
                  const key = turnChangeSetKey(turn);
                  const title =
                    turnLabels[key] ||
                    t("git.turnFiles", { count: turn.files.length });
                  return (
                    <DropdownMenuRadioItem
                      key={key}
                      value={key}
                      className="gap-2"
                    >
                      <span className="min-w-0 flex-1 truncate">{title}</span>
                      <span className="shrink-0 text-2xs text-muted-foreground">
                        {t("git.turnFiles", { count: turn.files.length })}
                      </span>
                    </DropdownMenuRadioItem>
                  );
                })}
              </DropdownMenuRadioGroup>
            ) : null}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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

export function ScopeAccessory({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 max-w-md items-center gap-1.5">{children}</div>
  );
}
