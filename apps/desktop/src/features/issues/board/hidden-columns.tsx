import type { ViewColumnRecord } from "@cocurdex/shared";
import { useDndContext, useDroppable } from "@dnd-kit/core";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/ui";
import { cn } from "@/lib";
import { useGroupColumnTitle } from "../group-column-title";
import { GroupFieldMark } from "../group-field-mark";

function HiddenColumnRow({
  column,
  title,
}: {
  column: ViewColumnRecord;
  title: string;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column-drop-${column.id}`,
    data: { type: "column-drop", columnId: column.id },
  });
  return (
    <li
      ref={setNodeRef}
      data-column-id={column.id}
      className={cn(
        "flex h-9 items-center gap-1.5 rounded-control px-2",
        isOver && "bg-muted/70 ring-1 ring-editor-border/50",
      )}
    >
      <GroupFieldMark column={column} />
      <Text size="body" truncate className="min-w-0 text-editor-fg-muted">
        {title}
      </Text>
      <Text
        size="meta"
        weight="medium"
        className="ms-auto tabular-nums text-editor-fg-subtle"
      >
        0
      </Text>
    </li>
  );
}

export function HiddenColumns({
  columns,
}: {
  columns: readonly ViewColumnRecord[];
}) {
  const { t } = useTranslation("issues");
  const titleOf = useGroupColumnTitle();
  const [expanded, setExpanded] = useState(false);
  const dragging = useDndContext().active !== null;
  if (columns.length === 0) return null;
  const open = expanded || dragging;
  return (
    <section
      aria-labelledby="issue-hidden-columns"
      className={cn("flex shrink-0 flex-col gap-1 p-2", open && "w-56")}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setExpanded((prev) => !prev)}
        className="flex h-9 items-center gap-1 rounded-control px-2 text-meta font-medium text-editor-fg-subtle outline-hidden hover:bg-foreground/5 hover:text-editor-fg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronRight
          aria-hidden
          className={cn("size-3.5 transition-transform", open && "rotate-90")}
        />
        <span id="issue-hidden-columns" className="whitespace-nowrap">
          {t("board.hiddenColumns")}
        </span>
        <span className="tabular-nums">{columns.length}</span>
      </button>
      {open ? (
        <ul
          aria-labelledby="issue-hidden-columns"
          className="flex min-h-0 flex-col overflow-y-auto"
        >
          {columns.map((column) => (
            <HiddenColumnRow
              key={column.id}
              column={column}
              title={titleOf(column)}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
