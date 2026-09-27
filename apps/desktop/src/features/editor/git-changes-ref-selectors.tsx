import type { TurnChangeSet } from "@cocurdex/shared";
import { GitBranch } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AppSearchableSelect } from "@/components";
import { Text } from "@/components/ui/text";
import type { GitBranchInfo, GitCommitInfo } from "@/lib";
import { formatCommitChip, formatTurnChip } from "./git-changes-scope-chip";
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
      <Text className="shrink-0 text-editor-fg-muted">→</Text>
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
      <Text className="shrink-0 font-mono" tone="muted">
        {shortHash}
      </Text>
      {subject ? <Text truncate>{subject}</Text> : null}
    </div>
  );
}

interface GitTurnScopeChipProps {
  scope: Extract<GitDiffScope, { mode: "turn" }>;
  turnLabels: Record<string, string>;
  turns: readonly TurnChangeSet[];
}

export function GitTurnScopeChip({
  scope,
  turnLabels,
  turns,
}: GitTurnScopeChipProps) {
  const { t } = useTranslation("editor");
  const label = formatTurnChip(turns, scope.messageId, turnLabels, t);
  if (!label) {
    return null;
  }
  return (
    <div className="flex min-w-0 max-w-56 items-center gap-1.5 px-1">
      <Text truncate>{label}</Text>
    </div>
  );
}
