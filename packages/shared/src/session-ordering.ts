export const SESSION_ORDERINGS = ["activity", "created", "title"] as const;
export type SessionOrdering = (typeof SESSION_ORDERINGS)[number];

export const SESSION_ORDER_DIRECTIONS = ["desc", "asc"] as const;
export type SessionOrderDirection = (typeof SESSION_ORDER_DIRECTIONS)[number];

export function defaultOrderDirection(
  ordering: SessionOrdering,
): SessionOrderDirection {
  return ordering === "title" ? "asc" : "desc";
}
