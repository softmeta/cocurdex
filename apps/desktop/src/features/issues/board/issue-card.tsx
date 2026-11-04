import type {
  IssueRecord,
  IssueStatusCategory,
  ViewGroupBy,
} from "@cocurdex/shared";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAtomValue } from "jotai";
import { Check, Flag, Pencil, Trash2 } from "lucide-react";
import type { CSSProperties, KeyboardEvent } from "react";
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
import { issueDisplayPropertiesAtom } from "../issue-display-store";
import { IssueMetaChips } from "../issue-meta-chips";
import { IssueStatusIcon } from "../issue-status-icon";

export interface CardFieldOption {
  id: string;
  title: string;
  category?: IssueStatusCategory | null;
}

interface IssueCardProps {
  card: IssueRecord;
  columnId: string;
  sortableId: string;
  groupBy: ViewGroupBy;
  statusOptions?: CardFieldOption[];
  priorityOptions?: CardFieldOption[];
  onDelete: (id: string) => void;
  onEdit: (card: IssueRecord) => void;
  onUpdateFields?: (
    id: string,
    fields: { status?: string; priority?: string },
  ) => void;
  // Rendered inside the DragOverlay — lifts the tile with a stronger shadow.
  overlay?: boolean;
}

export function IssueCard({
  card,
  columnId,
  sortableId,
  groupBy,
  statusOptions = [],
  priorityOptions = [],
  onDelete,
  onEdit,
  onUpdateFields,
  overlay,
}: IssueCardProps) {
  const { t } = useTranslation("issues");
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: sortableId,
    data: { type: "card", card, columnId },
  });
  const properties = useAtomValue(issueDisplayPropertiesAtom);
  const showStatus = properties.has("status");
  const showIdentifier = properties.has("identifier");
  const priorityTitle = priorityOptions.find(
    (option) => option.id === card.priority,
  )?.title;

  // The whole tile is the drag handle; a non-moving press falls through to the
  // onClick (PointerSensor has a 5px activation distance), opening the editor.
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const openCard = () => {
    onEdit(card);
  };

  const handleTileKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openCard();
    }
  };

  const tile = (
    <div
      ref={overlay ? undefined : setNodeRef}
      data-issue-id={overlay ? undefined : card.id}
      style={overlay ? undefined : style}
      {...(overlay ? {} : attributes)}
      {...(overlay ? {} : listeners)}
      className={cn(
        "group relative cursor-grab rounded-card border border-editor-border/70 bg-editor-chrome shadow-sm transition-[box-shadow,border-color,opacity] hover:border-editor-border hover:shadow-md active:cursor-grabbing",
        isDragging && "opacity-40",
        overlay &&
          "rotate-1 cursor-grabbing shadow-lg ring-1 ring-editor-border/50",
      )}
    >
      {/*
        Div (not <button>): hosts nested text and drag listeners; drag uses a
        5px activation distance so a plain press still opens the editor.
      */}
      {/* biome-ignore lint/a11y/useSemanticElements: tile hosts nested chrome; button forbids interactive children */}
      <div
        role="button"
        tabIndex={0}
        className="block w-full cursor-grab px-3 py-2.5 text-start active:cursor-grabbing"
        onClick={openCard}
        onKeyDown={handleTileKeyDown}
      >
        {showStatus || showIdentifier ? (
          <div className="mb-1.5 flex items-center gap-1.5 pe-5">
            {showStatus ? (
              <IssueStatusIcon
                statusId={card.status}
                category={card.statusCategory}
                color={card.color}
              />
            ) : null}
            {showIdentifier ? (
              <Text
                as="span"
                size="meta"
                weight="medium"
                className="truncate tabular-nums text-editor-fg-subtle"
              >
                {card.identifier}
              </Text>
            ) : null}
          </div>
        ) : null}
        <Text
          as="span"
          size="body"
          weight="medium"
          className="line-clamp-3 break-words text-editor-fg"
        >
          {card.title || t("board.untitledCard")}
        </Text>
        {properties.has("description") && card.description ? (
          <Text
            as="span"
            size="meta"
            className="mt-1 line-clamp-2 break-words text-editor-fg-muted"
          >
            {card.description}
          </Text>
        ) : null}
        <IssueMetaChips
          card={card}
          groupBy={groupBy}
          priorityTitle={priorityTitle}
          className="mt-2"
        />
      </div>
    </div>
  );

  if (overlay) {
    return tile;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{tile}</ContextMenuTrigger>
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
                        onUpdateFields?.(card.id, { status: opt.id });
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
                        onUpdateFields?.(card.id, { priority: opt.id });
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
