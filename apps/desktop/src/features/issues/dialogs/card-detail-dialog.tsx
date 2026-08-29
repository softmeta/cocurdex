import type {
  IssueRecord,
  ViewGroupBy,
  WorkspaceRecord,
} from "@cocurdex/shared";
import { Circle, Flag, FolderKanban } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MarkdownBodyEditor,
  type MarkdownBodyEditorHandle,
} from "@/components/markdown-body-editor";
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Text,
} from "@/components/ui";
import { cn } from "@/lib";

/** Null workspace selection in the compose/edit chip. */
export const WORKSPACE_NONE = null;

export interface IssueComposeDraft {
  columnId: string;
  status: string;
  priority: string;
  /** Default workspace association for new issues. */
  workspaceId: string | null;
}

interface CardDetailDialogProps {
  /** Existing issue (edit). Null when composing a new issue. */
  card: IssueRecord | null;
  /** Defaults for create mode (column the + was clicked on). */
  composeDraft: IssueComposeDraft | null;
  /**
   * Increments when full markdown is loaded for an existing card so only the
   * body editor remounts (title/status local state stay put).
   */
  bodyEpoch?: number;
  open: boolean;
  viewTitle: string;
  statusOptions: Array<{ id: string; title: string }>;
  priorityOptions: Array<{ id: string; title: string }>;
  workspaces: WorkspaceRecord[];
  groupBy: ViewGroupBy;
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    workspaceId: string | null;
    columnId?: string;
  }) => void;
}

export function CardDetailDialog({
  card,
  composeDraft,
  bodyEpoch = 0,
  open,
  viewTitle,
  statusOptions,
  priorityOptions,
  workspaces,
  onClose,
  onSave,
}: CardDetailDialogProps) {
  // Keep last open payload during Dialog exit animation. Clearing parent state
  // on close would unmount IssueForm immediately and leave only the header
  // fading out (looks like the chrome "lingers").
  const snapshotRef = useRef<{
    card: IssueRecord | null;
    composeDraft: IssueComposeDraft | null;
    bodyEpoch: number;
    viewTitle: string;
    formKey: string;
    isCreate: boolean;
  } | null>(null);

  if (card || composeDraft) {
    snapshotRef.current = {
      card,
      composeDraft,
      bodyEpoch,
      viewTitle,
      isCreate: card === null && composeDraft !== null,
      formKey:
        card?.id ?? (composeDraft ? `new-${composeDraft.columnId}` : "closed"),
    };
  }

  const snap = snapshotRef.current;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        size="default"
        className="gap-0 overflow-hidden p-0 sm:max-w-xl"
        showCloseButton
      >
        {snap ? (
          <>
            {/* Visually quiet header — Linear-style “New issue / Edit”. */}
            <div className="flex items-center gap-1.5 border-b border-editor-border/60 px-5 py-3">
              <DialogTitle className="flex min-w-0 items-center gap-1.5 text-meta font-medium text-editor-fg-muted">
                <Text size="meta" className="truncate text-editor-fg-subtle">
                  {snap.viewTitle}
                </Text>
                <span className="text-editor-fg-subtle" aria-hidden>
                  ›
                </span>
                <span className="truncate text-editor-fg">
                  {snap.isCreate ? (
                    <CreateTitleLabel />
                  ) : (
                    <EditTitleLabel id={snap.card?.id} />
                  )}
                </span>
              </DialogTitle>
            </div>
            <IssueForm
              key={snap.formKey}
              card={snap.card}
              composeDraft={snap.composeDraft}
              bodyEpoch={snap.bodyEpoch}
              statusOptions={statusOptions}
              priorityOptions={priorityOptions}
              workspaces={workspaces}
              isCreate={snap.isCreate}
              onClose={onClose}
              onSave={onSave}
            />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CreateTitleLabel() {
  const { t } = useTranslation("issues");
  return <>{t("dialog.newIssue")}</>;
}

function EditTitleLabel({ id }: { id?: string }) {
  const { t } = useTranslation("issues");
  return (
    <>
      {id ? (
        <span className="tabular-nums text-editor-fg-subtle">{id}</span>
      ) : (
        t("dialog.editCard")
      )}
    </>
  );
}

function IssueForm({
  card,
  composeDraft,
  bodyEpoch,
  statusOptions,
  priorityOptions,
  workspaces,
  isCreate,
  onClose,
  onSave,
}: {
  card: IssueRecord | null;
  composeDraft: IssueComposeDraft | null;
  bodyEpoch: number;
  statusOptions: Array<{ id: string; title: string }>;
  priorityOptions: Array<{ id: string; title: string }>;
  workspaces: WorkspaceRecord[];
  isCreate: boolean;
  onClose: () => void;
  onSave: CardDetailDialogProps["onSave"];
}) {
  const { t } = useTranslation("issues");
  const [title, setTitle] = useState(card?.title ?? "");
  const descriptionRef = useRef<MarkdownBodyEditorHandle>(null);
  const [status, setStatus] = useState(
    card?.status ?? composeDraft?.status ?? "backlog",
  );
  const [priority, setPriority] = useState(
    card?.priority ?? composeDraft?.priority ?? "none",
  );
  const [workspaceId, setWorkspaceId] = useState<string | null>(
    card?.workspaceId ?? composeDraft?.workspaceId ?? null,
  );
  // Latest description seed for the body editor (excerpt first, then full md).
  const bodyMarkdown = card?.description ?? "";

  const statusLabel =
    statusOptions.find((o) => o.id === status)?.title ?? status;
  const priorityLabel =
    priorityOptions.find((o) => o.id === priority)?.title ?? priority;
  const workspaceLabel = workspaceId
    ? (workspaces.find((w) => w.id === workspaceId)?.name ??
      t("dialog.unknownProject"))
    : t("dialog.noProject");

  const workspaceOptions: Array<{ id: string; title: string }> = [
    { id: "", title: t("dialog.noProject") },
    ...workspaces.map((w) => ({ id: w.id, title: w.name })),
  ];

  const handleSave = () => {
    const description = descriptionRef.current?.getMarkdown().trim() || null;
    onSave({
      id: card?.id,
      title: title.trim(),
      description,
      status,
      priority,
      workspaceId,
      columnId: composeDraft?.columnId,
    });
    onClose();
  };

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-1 px-5 pt-4 pb-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("dialog.titlePlaceholder")}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSave();
            }
          }}
          className="w-full border-0 bg-transparent text-display font-medium text-editor-fg outline-none placeholder:text-editor-fg-subtle"
        />
        <MarkdownBodyEditor
          key={`body-${card?.id ?? "new"}-${bodyEpoch}`}
          ref={descriptionRef}
          initialMarkdown={bodyMarkdown}
          placeholder={t("dialog.descriptionPlaceholder")}
          className="min-h-28 max-h-80 overflow-y-auto"
        />
      </div>

      {/* Field chips — Linear-style metadata row */}
      <div className="flex flex-wrap items-center gap-1.5 px-5 py-3">
        <FieldMenu
          icon={<Circle className="size-3.5" strokeWidth={2.25} />}
          label={statusLabel}
          options={statusOptions}
          value={status}
          onChange={setStatus}
          ariaLabel={t("dialog.status")}
        />
        <FieldMenu
          icon={<Flag className="size-3.5" />}
          label={priorityLabel}
          options={priorityOptions}
          value={priority}
          onChange={setPriority}
          ariaLabel={t("dialog.priority")}
        />
        <FieldMenu
          icon={<FolderKanban className="size-3.5" />}
          label={workspaceLabel}
          options={workspaceOptions}
          value={workspaceId ?? ""}
          onChange={(id) => setWorkspaceId(id || null)}
          ariaLabel={t("dialog.project")}
        />
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-editor-border/60 px-5 py-3">
        <Button variant="ghost" onClick={onClose}>
          {t("dialog.cancel")}
        </Button>
        <Button onClick={handleSave} disabled={isCreate && !title.trim()}>
          {isCreate ? t("dialog.createIssue") : t("dialog.save")}
        </Button>
      </div>
    </div>
  );
}

function FieldMenu({
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
        <button
          type="button"
          aria-label={ariaLabel}
          className={cn(
            "inline-flex h-7 max-w-48 items-center gap-1.5 rounded-full border border-editor-border/70 bg-editor-chrome px-2.5 text-meta font-medium text-editor-fg-muted transition-colors",
            "hover:border-editor-border hover:bg-editor-tab-hover-bg hover:text-editor-fg",
          )}
        >
          <span className="shrink-0 text-editor-fg-subtle">{icon}</span>
          <span className="truncate">{label}</span>
        </button>
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
