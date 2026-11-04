import type { ViewGroupBy } from "@cocurdex/shared";

export function isMultiValuedGrouping(groupBy: ViewGroupBy): boolean {
  return groupBy === "label";
}

export function cardSortableId(
  groupBy: ViewGroupBy,
  columnId: string,
  cardId: string,
): string {
  return isMultiValuedGrouping(groupBy) ? `${columnId}/${cardId}` : cardId;
}
