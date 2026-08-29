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
import type { GitDiffScope } from "./git-diff-scope";

const TOP_LEVEL_MODES = [
  "unstaged",
  "staged",
  "working",
  "branch",
] as const satisfies readonly Exclude<GitDiffScope["mode"], "commit">[];

interface GitChangesScopeMenuProps {
  scope: GitDiffScope;
  commits: readonly GitCommitInfo[];
  commitsLoading: boolean;
  disabled?: boolean;
  onScopeChange: (scope: GitDiffScope) => void;
  onOpenCommits: () => void;
}

export function GitChangesScopeMenu({
  scope,
  commits,
  commitsLoading,
  disabled = false,
  onScopeChange,
  onOpenCommits,
}: GitChangesScopeMenuProps) {
  const { t } = useTranslation("editor");
  const triggerLabel = t(`git.scope.${scope.mode}`);
  const commitSelected = scope.mode === "commit";
  // Top-level radio value: empty when a commit is selected so no mode row
  // shows checked alongside the commit sub-trigger.
  const modeValue = commitSelected ? "" : scope.mode;
  const selectedCommit =
    scope.mode === "commit"
      ? (commits.find(
          (commit) =>
            commit.hash === scope.commit || commit.shortHash === scope.commit,
        )?.hash ?? scope.commit)
      : "";

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) onOpenCommits();
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
              mode: mode as Exclude<GitDiffScope["mode"], "commit" | "branch">,
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

export function ScopeAccessory({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 max-w-md items-center gap-1.5">{children}</div>
  );
}
