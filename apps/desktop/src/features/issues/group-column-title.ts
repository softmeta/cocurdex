import {
  UNGROUPED_COLUMN_ID,
  type ViewColumnRecord,
  type ViewGroupBy,
} from "@cocurdex/shared";
import { useTranslation } from "react-i18next";

export function useGroupColumnTitle(): (
  column: Pick<ViewColumnRecord, "id" | "field" | "title">,
) => string {
  const { t } = useTranslation("issues");
  const ungrouped: Partial<Record<ViewGroupBy, string>> = {
    label: t("board.ungrouped.label"),
    workspace: t("board.ungrouped.workspace"),
    parent: t("board.ungrouped.parent"),
  };
  return (column) =>
    column.id === UNGROUPED_COLUMN_ID
      ? (ungrouped[column.field] ?? column.title)
      : column.title || t("board.untitledColumn");
}
