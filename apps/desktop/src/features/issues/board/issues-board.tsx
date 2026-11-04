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

interface IssuesBoardProps {
  board: ViewFull;
  onMoveIssue: (id: string, columnId: string, sortOrder: number) => void;
  onMoveIssueLocal: (id: string, columnId: string, sortOrder: number) => void;
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
  const [activeCard, setActiveCard] = useState<IssueRecord | null>(null);

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

  const issuesByColumn = useMemo(() => {
    const map = new Map<string, IssueRecord[]>();
    for (const col of sortedColumns) {
      map.set(col.id, []);
    }
    for (const card of board.issues) {
      const list = map.get(card.columnId);
      if (list) list.push(card);
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return map;
  }, [board.issues, sortedColumns]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const data = active.data.current;
    if (data?.type === "card") {
      setActiveCard(data.card as IssueRecord);
    }
  }, []);

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;
      const activeData = active.data.current;
      if (activeData?.type !== "card") return;

      // Determine target column
      const overData = over.data.current;
      let targetColumnId: string | undefined;
      if (overData?.type === "card") {
        targetColumnId = (overData.card as IssueRecord).columnId;
      } else if (overData?.type === "column-drop") {
        targetColumnId = overData.columnId as string;
      }

      if (!targetColumnId) return;

      const card = activeData.card as IssueRecord;
      if (card.columnId !== targetColumnId) {
        // Local-only optimistic move so the card renders in the hovered
        // column while dragging; persisted once in handleDragEnd.
        const targetCards = issuesByColumn.get(targetColumnId) ?? [];
        const lastSort =
          targetCards.length > 0
            ? targetCards[targetCards.length - 1].sortOrder + SORT_STEP
            : SORT_STEP;
        onMoveIssueLocal(card.id, targetColumnId, lastSort);
      }
    },
    [issuesByColumn, onMoveIssueLocal],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveCard(null);

      if (!over) return;

      const activeData = active.data.current;
      const overData = over.data.current;

      if (activeData?.type !== "card") return;
      const cardId = (activeData.card as IssueRecord).id;
      // Read the card from board state: handleDragOver may already have
      // moved it to the hovered column, and active.data can lag behind.
      const card = board.issues.find((c) => c.id === cardId);
      if (!card) return;

      if (overData?.type === "card") {
        const overCard = overData.card as IssueRecord;
        if (card.id === overCard.id) {
          // Cross-column drop landed on the card itself after the dragOver
          // move; persist the position dragOver gave it.
          onMoveIssue(card.id, card.columnId, card.sortOrder);
          return;
        }
        const targetCards = issuesByColumn.get(overCard.columnId) ?? [];
        const oldIndex = targetCards.findIndex((c) => c.id === card.id);
        const overIndex = targetCards.findIndex((c) => c.id === overCard.id);
        if (overIndex === -1) return;
        if (oldIndex === -1) {
          // Not in the target column locally (shouldn't happen after
          // dragOver, but keep the drop deterministic): insert before over.
          const sortOrder = sortOrderBetween(
            targetCards[overIndex - 1]?.sortOrder,
            overCard.sortOrder,
          );
          onMoveIssue(card.id, overCard.columnId, sortOrder);
          return;
        }
        const reordered = arrayMove(targetCards, oldIndex, overIndex);
        onMoveIssue(
          card.id,
          overCard.columnId,
          sortOrderAt(reordered, overIndex),
        );
        return;
      }

      if (overData?.type === "column-drop") {
        // Dropped on the column's empty space: send the card to the end
        // (cross-column dragOver already did this locally; same-column drops
        // below the last card get it here) and persist once.
        const others = (issuesByColumn.get(card.columnId) ?? []).filter(
          (c) => c.id !== card.id,
        );
        const last = others[others.length - 1];
        const sortOrder =
          last && last.sortOrder > card.sortOrder
            ? last.sortOrder + SORT_STEP
            : card.sortOrder;
        onMoveIssue(card.id, card.columnId, sortOrder);
      }
    },
    [board.issues, issuesByColumn, onMoveIssue],
  );

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <ScrollArea
        scrollbarProps={{ orientation: "horizontal" }}
        className="min-h-0 flex-1"
      >
        <div className="flex h-full w-max items-stretch gap-6 px-5 py-4">
          {sortedColumns.map((column) => (
            <IssueColumn
              key={column.id}
              column={column}
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
        </div>
      </ScrollArea>
      <DragOverlay>
        {activeCard ? (
          <IssueCard
            card={activeCard}
            onDelete={() => {}}
            onEdit={() => {}}
            overlay
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
