import type { IssueRecord, ViewColumnRecord } from "@cocurdex/shared";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { TitlebarIconButton } from "@/app/layout/titlebar-icon-button";
import { ScrollArea, Text } from "@/components/ui";
import { cn } from "@/lib";
import { GroupFieldMark } from "../group-field-mark";
import { InlineEdit } from "../inline-edit";
import { ColumnMenu } from "./column-menu";
import { type CardFieldOption, IssueCard } from "./issue-card";

interface IssueColumnProps {
  column: ViewColumnRecord;
  issues: IssueRecord[];
  statusOptions: CardFieldOption[];
  priorityOptions: Array<{ id: string; title: string }>;
  onAddCard: (columnId: string) => void;
  onDeleteCard: (cardId: string) => void;
  onEditCard: (card: IssueRecord) => void;
  onUpdateCardFields: (
    id: string,
    fields: { status?: string; priority?: string },
  ) => void;
  onRenameColumn: (id: string, title: string) => void;
}

export function IssueColumn({
  column,
  issues,
  statusOptions,
  priorityOptions,
  onAddCard,
  onDeleteCard,
  onEditCard,
  onUpdateCardFields,
  onRenameColumn,
}: IssueColumnProps) {
  const { t } = useTranslation("issues");
  const [editing, setEditing] = useState(false);
  const cardIds = useMemo(() => issues.map((c) => c.id), [issues]);

  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `column-drop-${column.id}`,
    data: { type: "column-drop", columnId: column.id },
  });

  return (
    <div
      data-column-id={column.id}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-panel bg-muted/50 p-2",
        isOver && "bg-muted/70 ring-1 ring-editor-border/50",
      )}
    >
      <div className="group flex h-9 items-center gap-1.5 px-1">
        <GroupFieldMark column={column} />
        <div className="min-w-0" data-testid="issue-column-title-cell">
          <InlineEdit
            value={column.title}
            editing={editing}
            placeholder={t("board.untitledColumn")}
            onSubmit={(title) => {
              setEditing(false);
              if (title !== column.title) onRenameColumn(column.id, title);
            }}
            onCancel={() => setEditing(false)}
            className="w-full bg-transparent text-body font-medium text-editor-fg outline-none"
          >
            <button
              type="button"
              className="block max-w-44 cursor-text truncate text-start"
              onClick={() => setEditing(true)}
            >
              <Text size="body" weight="medium" className="text-editor-fg">
                {column.title || t("board.untitledColumn")}
              </Text>
            </button>
          </InlineEdit>
        </div>
        <Text
          size="meta"
          weight="medium"
          className="tabular-nums text-editor-fg-subtle"
        >
          {issues.length}
        </Text>
        <div className="ms-auto flex shrink-0 items-center gap-0.5">
          <TitlebarIconButton
            aria-label={t("board.addCard")}
            onClick={() => onAddCard(column.id)}
          >
            <Plus className="size-3.5" />
          </TitlebarIconButton>
          {column.category ? <ColumnMenu /> : null}
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div
          ref={setDroppableRef}
          className="flex min-h-[160px] flex-col gap-2 pb-1"
        >
          <SortableContext
            items={cardIds}
            strategy={verticalListSortingStrategy}
          >
            {issues.map((card) => (
              <IssueCard
                key={card.id}
                card={card}
                statusOptions={statusOptions}
                priorityOptions={priorityOptions}
                onDelete={onDeleteCard}
                onEdit={onEditCard}
                onUpdateFields={onUpdateCardFields}
              />
            ))}
          </SortableContext>
        </div>
      </ScrollArea>
    </div>
  );
}
