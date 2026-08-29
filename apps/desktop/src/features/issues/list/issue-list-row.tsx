import type { IssueRecord, ViewGroupBy } from "@cocurdex/shared";
import { Check, Circle, Flag, Pencil, Trash2 } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  Text,
} from "@/components/ui";
import { cn } from "@/lib";
import { priorityFieldColor, statusFieldColor } from "../group-field-color";

export interface ListFieldOption {
  id: string;
  title: string;
}

interface IssueListRowProps {
  card: IssueRecord;
  /** Active grouping — the grouping field is already the section header. */
  groupBy: ViewGroupBy;
  statusOptions: ListFieldOption[];
  priorityOptions: ListFieldOption[];
  onDelete: (id: string) => void;
  onEdit: (card: IssueRecord) => void;
  onUpdateFields: (
    id: string,
    fields: { status?: string; priority?: string },
  ) => void;
}

function formatMetaDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function IssueListRow({
  card,
  groupBy,
  statusOptions,
  priorityOptions,
  onDelete,
  onEdit,
  onUpdateFields,
}: IssueListRowProps) {
  const { t } = useTranslation("issues");
  const statusColor = statusFieldColor(card.status, card.color);
  const priorityColor = priorityFieldColor(card.priority || "none");
  const updated = card.updatedAt !== card.createdAt;
  const metaDate = formatMetaDate(updated ? card.updatedAt : card.createdAt);

  // Show the field that is *not* the group key so rows stay quiet under a
  // section header that already carries the grouping value.
  const showStatusMark = groupBy !== "status";
  const showPriorityMark =
    groupBy !== "priority" && (card.priority || "none") !== "none";

  const openCard = () => {
    onEdit(card);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openCard();
    }
  };

  const row = (
    // biome-ignore lint/a11y/useSemanticElements: row hosts nested context menu; button forbids interactive children
    <div
      role="button"
      tabIndex={0}
      className={cn(
        // Same row chrome as notes sidebar / issues sidebar.
        "group flex h-8 w-full items-center gap-1.5 rounded-control px-2 text-start",
        "hover:bg-editor-tab-hover-bg",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      )}
      onClick={openCard}
      onKeyDown={handleKeyDown}
    >
      {showPriorityMark ? (
        <Flag
          className="size-3.5 shrink-0"
          style={priorityColor ? { color: priorityColor } : undefined}
          strokeWidth={2}
          aria-hidden
        />
      ) : null}
      {showStatusMark ? (
        <Circle
          className={cn(
            "size-3.5 shrink-0",
            !statusColor && "text-muted-foreground",
          )}
          style={statusColor ? { color: statusColor } : undefined}
          strokeWidth={2}
          aria-hidden
        />
      ) : null}
      {!showPriorityMark && !showStatusMark ? (
        <span className="size-3.5 shrink-0" aria-hidden />
      ) : null}
      <Text
        as="span"
        size="meta"
        weight="medium"
        className="shrink-0 tabular-nums text-editor-fg-subtle"
      >
        {card.id}
      </Text>
      <Text
        as="span"
        size="body"
        className="min-w-0 flex-1 truncate leading-6 text-editor-fg"
      >
        {card.title || t("board.untitledCard")}
      </Text>
      {metaDate ? (
        <Text
          as="span"
          size="meta"
          className="ms-auto shrink-0 text-editor-fg-subtle opacity-0 transition-opacity group-hover:opacity-100"
          title={
            updated
              ? t("list.updatedOn", { date: metaDate })
              : t("list.createdOn", { date: metaDate })
          }
        >
          {metaDate}
        </Text>
      ) : null}
    </div>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-48">
        <ContextMenuItem
          onClick={() => {
            onEdit(card);
          }}
        >
          <Pencil className="size-3.5" />
          {t("cardMenu.open")}
        </ContextMenuItem>

        {statusOptions.length > 0 ? (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Circle className="size-3.5" strokeWidth={2.25} />
              {t("cardMenu.status")}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="min-w-40">
              {statusOptions.map((opt) => {
                const selected = opt.id === card.status;
                return (
                  <ContextMenuItem
                    key={opt.id}
                    onClick={() => {
                      if (!selected) {
                        onUpdateFields(card.id, { status: opt.id });
                      }
                    }}
                  >
                    <span className="flex-1">{opt.title}</span>
                    {selected ? <Check className="size-3.5" /> : null}
                  </ContextMenuItem>
                );
              })}
            </ContextMenuSubContent>
          </ContextMenuSub>
        ) : null}

        {priorityOptions.length > 0 ? (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Flag className="size-3.5" />
              {t("cardMenu.priority")}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="min-w-40">
              {priorityOptions.map((opt) => {
                const selected = opt.id === (card.priority || "none");
                return (
                  <ContextMenuItem
                    key={opt.id}
                    onClick={() => {
                      if (!selected) {
                        onUpdateFields(card.id, { priority: opt.id });
                      }
                    }}
                  >
                    <span className="flex-1">{opt.title}</span>
                    {selected ? <Check className="size-3.5" /> : null}
                  </ContextMenuItem>
                );
              })}
            </ContextMenuSubContent>
          </ContextMenuSub>
        ) : null}

        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onClick={() => {
            onDelete(card.id);
          }}
        >
          <Trash2 className="size-3.5" />
          {t("cardMenu.delete")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
