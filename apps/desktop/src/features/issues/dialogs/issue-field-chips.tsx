import type { IssueLabel, IssueRecord, IssueSummary } from "@cocurdex/shared";
import { GitBranchPlus, Plus, Tag } from "lucide-react";
import { type ComponentProps, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppSearchableSelect } from "@/components/app";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
} from "@/components/ui";
import { cn } from "@/lib";

const NO_PARENT = "";

export function IssueFieldChip({
  icon,
  label,
  className,
  ...props
}: ComponentProps<"button"> & { icon: ReactNode; label: ReactNode }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex h-7 max-w-48 items-center gap-1.5 rounded-full border border-editor-border/70 bg-editor-chrome px-2.5 text-meta font-medium text-editor-fg-muted transition-colors hover:border-editor-border hover:bg-editor-tab-hover-bg hover:text-editor-fg",
        className,
      )}
    >
      <span className="shrink-0 text-editor-fg-subtle">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

export function FieldMenu({
  icon,
  label,
  options,
  value,
  onChange,
  ariaLabel,
}: {
  icon: ReactNode;
  label: string;
  options: Array<{ id: string; title: string }>;
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IssueFieldChip aria-label={ariaLabel} icon={icon} label={label} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-40">
        {options.map((opt) => (
          <DropdownMenuItem
            key={opt.id || "none"}
            onClick={() => onChange(opt.id)}
            className={cn(opt.id === value && "bg-accent")}
          >
            {opt.title}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function toggleId(ids: readonly string[], id: string): string[] {
  return ids.includes(id)
    ? ids.filter((candidate) => candidate !== id)
    : [...ids, id];
}

export function LabelsChip({
  labels,
  value,
  onChange,
  onCreateLabel,
}: {
  labels: readonly IssueLabel[];
  value: readonly string[];
  onChange: (ids: string[]) => void;
  onCreateLabel: (name: string) => Promise<IssueLabel | null>;
}) {
  const { t } = useTranslation("issues");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const selectedNames = labels
    .filter((label) => value.includes(label.id))
    .map((label) => label.name);
  const chipLabel =
    selectedNames.length > 0 ? selectedNames.join(", ") : t("dialog.labels");

  const submitDraft = async () => {
    const name = draft.trim();
    setCreating(false);
    setDraft("");
    if (!name) {
      return;
    }
    const existing = labels.find(
      (label) => label.name.toLowerCase() === name.toLowerCase(),
    );
    const label = existing ?? (await onCreateLabel(name));
    if (label && !value.includes(label.id)) {
      onChange([...value, label.id]);
    }
  };

  if (creating) {
    return (
      <Input
        autoFocus
        value={draft}
        placeholder={t("dialog.newLabelPlaceholder")}
        aria-label={t("dialog.newLabel")}
        className="h-7 w-40"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          void submitDraft();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void submitDraft();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setDraft("");
            setCreating(false);
          }
        }}
      />
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IssueFieldChip
          aria-label={t("dialog.labels")}
          icon={<Tag className="size-3.5" />}
          label={chipLabel}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        {labels.map((label) => (
          <DropdownMenuCheckboxItem
            key={label.id}
            checked={value.includes(label.id)}
            closeOnClick={false}
            onCheckedChange={() => onChange(toggleId(value, label.id))}
          >
            {label.name}
          </DropdownMenuCheckboxItem>
        ))}
        {labels.length > 0 ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem onClick={() => setCreating(true)}>
          <Plus className="size-3.5" />
          {t("dialog.newLabel")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ParentChip({
  issueId,
  issues,
  knownParent,
  value,
  onChange,
}: {
  issueId: string | null;
  issues: readonly IssueRecord[];
  knownParent: IssueSummary | null;
  value: string | null;
  onChange: (parentId: string | null) => void;
}) {
  const { t } = useTranslation("issues");
  const parent =
    issues.find((issue) => issue.id === value) ??
    (knownParent?.id === value ? knownParent : undefined);
  const options = [
    { value: NO_PARENT, label: t("dialog.noParent") },
    ...issues
      .filter((issue) => issue.id !== issueId)
      .map((issue) => ({
        value: issue.id,
        label: `${issue.identifier} ${issue.title}`,
        keywords: issue.identifier,
      })),
  ];
  const chipLabel = parent
    ? `${t("dialog.parent")}: ${parent.identifier}`
    : t("dialog.parent");

  return (
    <AppSearchableSelect
      value={value ?? NO_PARENT}
      onValueChange={(next) => onChange(next || null)}
      options={options}
      searchPlaceholder={t("dialog.searchIssues")}
      emptyText={t("dialog.noMatchingIssues")}
      triggerAriaLabel={t("dialog.parent")}
      triggerLabel={chipLabel}
      showChevron={false}
      trigger={
        <IssueFieldChip
          icon={<GitBranchPlus className="size-3.5" />}
          label={chipLabel}
        />
      }
    />
  );
}
