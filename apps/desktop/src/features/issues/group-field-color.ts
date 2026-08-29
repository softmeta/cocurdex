import type { ViewColumnRecord } from "@cocurdex/shared";

/** UI tint for default status / priority column ids (Linear-like hierarchy). */
export function groupFieldColor(
  column: Pick<ViewColumnRecord, "id" | "color">,
): string | undefined {
  if (column.color) return column.color;
  switch (column.id) {
    case "doing":
      return "var(--chat-status-running-text)";
    case "review":
      return "var(--chat-status-pending-text)";
    case "done":
      return "var(--chat-status-completed-text)";
    case "urgent":
      return "var(--chat-status-error-text)";
    case "high":
      return "var(--chat-status-pending-text)";
    case "medium":
      return "var(--chat-status-running-text)";
    default:
      return undefined;
  }
}

export function statusFieldColor(
  statusId: string,
  color?: string | null,
): string | undefined {
  return groupFieldColor({ id: statusId, color: color ?? null });
}

export function priorityFieldColor(
  priorityId: string,
  color?: string | null,
): string | undefined {
  return groupFieldColor({ id: priorityId, color: color ?? null });
}
