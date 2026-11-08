import type {
  IssueRecord,
  IssueStatusCategory,
  ViewGroupBy,
} from "@cocurdex/shared";
import { useAtomValue } from "jotai";
import { Check, Flag, Pencil, Trash2 } from "lucide-react";
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
import { priorityFieldColor } from "../group-field-color";
import {
  formatIssueDate,
  issueDisplayPropertiesAtom,
} from "../issue-display-store";
import { IssueMetaChips } from "../issue-meta-chips";
import { IssueStatusIcon } from "../issue-status-icon";

export interface ListFieldOption {
  id: string;
  title: string;
  category?: IssueStatusCategory | null;
}

interface IssueListRowProps {
  card: IssueRecord;
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
  const priorityColor = priorityFieldColor(card.priority || "none");
  const updated = card.updatedAt !== card.createdAt;
  const properties = useAtomValue(issueDisplayPropertiesAtom);
  const metaDate =
    properties.has("created") || properties.has("updated")
      ? ""
      : formatIssueDate(updated ? card.updatedAt : card.createdAt);

  const showStatusMark = groupBy !== "status" && properties.has("status");
  const showPriorityMark =
    groupBy !== "priority" &&
    properties.has("priority") &&
    (card.priority || "none") !== "none";

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
      data-issue-id={card.id}
      className={cn(
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
        <IssueStatusIcon
          statusId={card.status}
          category={card.statusCategory}
          color={card.color}
        />
      ) : null}
      {!showPriorityMark && !showStatusMark ? (
        <span className="size-3.5 shrink-0" aria-hidden />
      ) : null}
      {properties.has("identifier") ? (
        <Text
          as="span"
          size="meta"
          weight="medium"
          className="shrink-0 tabular-nums text-editor-fg-subtle"
        >
          {card.identifier}
        </Text>
      ) : null}
      <Text
        as="span"
        size="body"
        className="min-w-0 flex-1 truncate leading-6 text-editor-fg"
      >
        {card.title || t("board.untitledCard")}
      </Text>
      <IssueMetaChips
        card={card}
        groupBy={groupBy}
        omit="priority"
        className="shrink-0 flex-nowrap"
      />
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
              <IssueStatusIcon
                statusId={card.status}
                category={card.statusCategory}
              />
              {t("cardMenu.status")}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
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
                    <IssueStatusIcon
                      statusId={opt.id}
                      category={opt.category ?? null}
                    />
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
            <ContextMenuSubContent>
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
