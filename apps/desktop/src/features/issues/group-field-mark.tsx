import type { ViewColumnRecord } from "@cocurdex/shared";
import { Flag } from "lucide-react";
import { cn } from "@/lib";
import { groupFieldColor } from "./group-field-color";
import { IssueStatusIcon } from "./issue-status-icon";

export function GroupFieldMark({
  column,
}: {
  column: Pick<ViewColumnRecord, "id" | "field" | "color" | "category">;
}) {
  if (column.field === "status") {
    return (
      <IssueStatusIcon
        statusId={column.id}
        category={column.category}
        color={column.color}
      />
    );
  }
  const color = groupFieldColor(column);
  return (
    <Flag
      aria-hidden
      className={cn("size-3.5 shrink-0", !color && "text-editor-fg-subtle")}
      style={color ? { color } : undefined}
    />
  );
}
