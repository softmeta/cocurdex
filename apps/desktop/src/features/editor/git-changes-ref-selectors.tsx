import { GitBranch } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AppSearchableSelect } from "@/components";
import { Text } from "@/components/ui/text";
import type { GitBranchInfo, GitCommitInfo } from "@/lib";
import { CopyButton } from "./copy-button";
import { formatCommitChip } from "./git-changes-scope-menu";
import type { GitDiffScope } from "./git-diff-scope";

interface GitBranchRefSelectorsProps {
  // Left: branch under review (has the changes).
  source: string;
  // Right: branch to compare against (merge destination).
  target: string;
  refs: readonly GitBranchInfo[];
  disabled?: boolean;
  onChange: (next: { source: string; target: string }) => void;
}

export function GitBranchRefSelectors({
  source,
  target,
  refs,
  disabled = false,
  onChange,
}: GitBranchRefSelectorsProps) {
  const { t } = useTranslation("editor");

  return (
    <div className="flex min-w-0 items-center gap-1">
      <RefSelect
        ariaLabel={t("git.selectSource")}
        disabled={disabled}
        onValueChange={(value) => onChange({ source: value, target })}
        refs={refs}
        value={source}
      />
      <Text className="shrink-0 text-editor-fg-muted" size="meta">
        →
      </Text>
      <RefSelect
        ariaLabel={t("git.selectTarget")}
        disabled={disabled}
        onValueChange={(value) => onChange({ source, target: value })}
        refs={refs}
        value={target}
      />
    </div>
  );
}

function RefSelect({
  value,
  refs,
  disabled,
  ariaLabel,
  onValueChange,
}: {
  value: string;
  refs: readonly GitBranchInfo[];
  disabled?: boolean;
  ariaLabel: string;
  onValueChange: (value: string) => void;
}) {
  const { t } = useTranslation("editor");
  const options = useMemo(
    () =>
      refs.map((ref) => ({
        value: ref.name,
        label: ref.name,
        keywords: `${ref.kind} ${ref.name}`,
        icon: <GitBranch className="size-3.5" />,
      })),
    [refs],
  );

  return (
    <AppSearchableSelect
      appearance="ghost"
      disabled={disabled || refs.length === 0}
      emptyText={t("git.noMatchingBranches")}
      options={options}
      searchPlaceholder={t("git.searchBranches")}
      triggerAriaLabel={ariaLabel}
      triggerClassName="app-no-drag h-7 max-w-36"
      triggerLabel={value || ariaLabel}
      value={value}
      onValueChange={onValueChange}
    />
  );
}

interface GitCommitScopeChipProps {
  scope: Extract<GitDiffScope, { mode: "commit" }>;
  commits: readonly GitCommitInfo[];
}

export function GitCommitScopeChip({
  scope,
  commits,
}: GitCommitScopeChipProps) {
  const { shortHash, subject } = formatCommitChip(commits, scope.commit);
  return (
    <div className="flex min-w-0 max-w-56 items-center gap-1.5 px-1">
      <Text className="shrink-0 font-mono" size="meta" tone="muted">
        {shortHash}
      </Text>
      {subject ? (
        <Text size="meta" truncate>
          {subject}
        </Text>
      ) : null}
    </div>
  );
}

interface GitCurrentBranchChipProps {
  currentBranch: string | null;
}

// Shown next to worktree scopes so the user still sees which branch the
// working tree is on (the mode menu no longer doubles as the branch label).
export function GitCurrentBranchChip({
  currentBranch,
}: GitCurrentBranchChipProps) {
  const { t } = useTranslation("editor");
  return (
    <div className="group flex max-w-44 min-w-0 shrink-0 items-center gap-1 px-1">
      <Text size="meta" tone="muted" truncate>
        {currentBranch ?? t("git.noBranch")}
      </Text>
      {currentBranch ? (
        <CopyButton
          label={t("git.copyBranch")}
          showTooltip={false}
          value={currentBranch}
        />
      ) : null}
    </div>
  );
}
