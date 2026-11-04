import {
  type IssueRecord,
  sortIssueColumns,
  type ViewFull,
} from "@cocurdex/shared";
import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useCallback, useMemo, useState } from "react";
import { ScrollArea } from "@/components/ui";
import { groupIssuesByColumn, partitionEmptyColumns } from "../group-issues";
import { cardSortableId, isMultiValuedGrouping } from "./card-placement";
import { HiddenColumns } from "./hidden-columns";
import { IssueCard } from "./issue-card";
import { IssueColumn } from "./issue-column";

const SORT_STEP = 1000;

// Sort order between two neighbors; sort_order is REAL in SQLite so repeated
// midpoints stay exact long past any realistic drag count.
function sortOrderBetween(before?: number, after?: number): number {
  if (before !== undefined && after !== undefined) return (before + after) / 2;
  if (after !== undefined) return after - SORT_STEP;
  if (before !== undefined) return before + SORT_STEP;
  return SORT_STEP;
}

// Sort order for an item of `items` landing at `index` after an arrayMove.
function sortOrderAt<T extends { sortOrder: number }>(
  items: T[],
  index: number,
): number {
  return sortOrderBetween(
    items[index - 1]?.sortOrder,
    items[index + 1]?.sortOrder,
  );
}

export interface IssueMove {
  id: string;
  columnId: string;
  fromColumnId: string;
  sortOrder: number;
}

interface DragOrigin {
  card: IssueRecord;
  fromColumnId: string;
}

interface IssuesBoardProps {
  board: ViewFull;
  onMoveIssue: (move: IssueMove) => void;
  onMoveIssueLocal: (move: IssueMove) => void;
  onAddCard: (columnId: string) => void;
  onDeleteCard: (cardId: string) => void;
  onEditCard: (card: IssueRecord) => void;
  onUpdateCardFields: (
    id: string,
    fields: { status?: string; priority?: string },
  ) => void;
  onRenameColumn: (id: string, title: string) => void;
}

export function IssuesBoard({
  board,
  onMoveIssue,
  onMoveIssueLocal,
  onAddCard,
  onDeleteCard,
  onEditCard,
  onUpdateCardFields,
  onRenameColumn,
}: IssuesBoardProps) {
  const [dragOrigin, setDragOrigin] = useState<DragOrigin | null>(null);
  const [dragVisibleIds, setDragVisibleIds] = useState<Set<string> | null>(
    null,
  );
  const { groupBy, display } = board.view;
  const multiValued = isMultiValuedGrouping(groupBy);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const sortedColumns = useMemo(
    () => sortIssueColumns(board.columns),
    [board.columns],
  );

  const issuesByColumn = useMemo(
    () => groupIssuesByColumn(sortedColumns, board.issues),
    [board.issues, sortedColumns],
  );

  const { visible, hidden } = useMemo(() => {
    const partition = partitionEmptyColumns(
      sortedColumns,
      issuesByColumn,
      display.showEmptyGroups,
    );
    if (!dragVisibleIds) return partition;
    return {
      visible: sortedColumns.filter((column) => dragVisibleIds.has(column.id)),
      hidden: sortedColumns.filter((column) => !dragVisibleIds.has(column.id)),
    };
  }, [sortedColumns, issuesByColumn, display.showEmptyGroups, dragVisibleIds]);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const data = event.active.data.current;
      if (data?.type !== "card") return;
      setDragOrigin({
        card: data.card as IssueRecord,
        fromColumnId: data.columnId as string,
      });
      setDragVisibleIds(new Set(visible.map((column) => column.id)));
    },
    [visible],
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;
      const activeData = active.data.current;
      if (multiValued || activeData?.type !== "card") return;
      const targetColumnId = over.data.current?.columnId as string | undefined;
      if (!targetColumnId) return;

      const card = board.issues.find(
        (candidate) => candidate.id === (activeData.card as IssueRecord).id,
      );
      if (card && card.columnId !== targetColumnId) {
        // Local-only optimistic move so the card renders in the hovered
        // column while dragging; persisted once in handleDragEnd.
        const targetCards = issuesByColumn.get(targetColumnId) ?? [];
        const lastSort =
          targetCards.length > 0
            ? targetCards[targetCards.length - 1].sortOrder + SORT_STEP
            : SORT_STEP;
        onMoveIssueLocal({
          id: card.id,
          columnId: targetColumnId,
          fromColumnId: card.columnId,
          sortOrder: lastSort,
        });
      }
    },
    [board.issues, issuesByColumn, multiValued, onMoveIssueLocal],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { over } = event;
      const origin = dragOrigin;
      setDragOrigin(null);
      setDragVisibleIds(null);
      if (!over || !origin) return;

      const overData = over.data.current;
      const targetColumnId = overData?.columnId as string | undefined;
      // Read the card from board state: handleDragOver may already have
      // moved it to the hovered column, and active.data can lag behind.
      const card = board.issues.find((c) => c.id === origin.card.id);
      if (!card || !targetColumnId) return;
      const move = (sortOrder: number) =>
        onMoveIssue({
          id: card.id,
          columnId: targetColumnId,
          fromColumnId: origin.fromColumnId,
          sortOrder,
        });
      const targetCards = issuesByColumn.get(targetColumnId) ?? [];

      if (overData?.type === "card") {
        const overCard = overData.card as IssueRecord;
        if (card.id === overCard.id) {
          move(card.sortOrder);
          return;
        }
        const oldIndex = targetCards.findIndex((c) => c.id === card.id);
        const overIndex = targetCards.findIndex((c) => c.id === overCard.id);
        if (overIndex === -1) return;
        if (oldIndex === -1) {
          move(
            sortOrderBetween(
              targetCards[overIndex - 1]?.sortOrder,
              overCard.sortOrder,
            ),
          );
          return;
        }
        move(
          sortOrderAt(arrayMove(targetCards, oldIndex, overIndex), overIndex),
        );
        return;
      }

      if (overData?.type === "column-drop") {
        const others = targetCards.filter((c) => c.id !== card.id);
        const last = others[others.length - 1];
        move(
          last && last.sortOrder >= card.sortOrder
            ? last.sortOrder + SORT_STEP
            : card.sortOrder,
        );
      }
    },
    [board.issues, dragOrigin, issuesByColumn, onMoveIssue],
  );

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setDragOrigin(null);
        setDragVisibleIds(null);
      }}
    >
      <ScrollArea
        scrollbarProps={{ orientation: "horizontal" }}
        className="min-h-0 flex-1"
      >
        <div className="flex h-full w-max items-stretch gap-6 px-5 py-4">
          {visible.map((column) => (
            <IssueColumn
              key={column.id}
              column={column}
              groupBy={groupBy}
              issues={issuesByColumn.get(column.id) ?? []}
              statusOptions={board.statusOptions}
              priorityOptions={board.priorityOptions}
              onAddCard={onAddCard}
              onDeleteCard={onDeleteCard}
              onEditCard={onEditCard}
              onUpdateCardFields={onUpdateCardFields}
              onRenameColumn={onRenameColumn}
            />
          ))}
          <HiddenColumns columns={hidden} />
        </div>
      </ScrollArea>
      <DragOverlay>
        {dragOrigin ? (
          <IssueCard
            card={dragOrigin.card}
            columnId={dragOrigin.fromColumnId}
            sortableId={`overlay-${cardSortableId(groupBy, dragOrigin.fromColumnId, dragOrigin.card.id)}`}
            groupBy={groupBy}
            priorityOptions={board.priorityOptions}
            onDelete={() => {}}
            onEdit={() => {}}
            overlay
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
