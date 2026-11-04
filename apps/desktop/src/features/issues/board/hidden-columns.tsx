import type { ViewColumnRecord } from "@cocurdex/shared";
import { useDroppable } from "@dnd-kit/core";
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
  if (columns.length === 0) return null;
  return (
    <section
      aria-labelledby="issue-hidden-columns"
      className="flex w-56 shrink-0 flex-col gap-1 p-2"
    >
      <Text
        id="issue-hidden-columns"
        size="meta"
        weight="medium"
        className="flex h-9 items-center px-2 text-editor-fg-subtle"
      >
        {t("board.hiddenColumns")}
      </Text>
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
    </section>
  );
}
