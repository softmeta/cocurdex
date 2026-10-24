export type CompactRelativeUnit = "now" | "m" | "h" | "d" | "mo" | "y";

export interface CompactRelativeTime {
  count: number;
  unit: CompactRelativeUnit;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

export function getCompactRelativeTime(
  iso: string,
  nowMs = Date.now(),
): CompactRelativeTime {
  const thenMs = Date.parse(iso);
  if (Number.isNaN(thenMs)) {
    return { count: 0, unit: "now" };
  }

  const elapsedMs = Math.max(0, nowMs - thenMs);

  if (elapsedMs < MINUTE_MS) {
    return { count: 0, unit: "now" };
  }
  if (elapsedMs < HOUR_MS) {
    return { count: Math.floor(elapsedMs / MINUTE_MS), unit: "m" };
  }
  if (elapsedMs < DAY_MS) {
    return { count: Math.floor(elapsedMs / HOUR_MS), unit: "h" };
  }
  if (elapsedMs < MONTH_MS) {
    return { count: Math.floor(elapsedMs / DAY_MS), unit: "d" };
  }
  if (elapsedMs < YEAR_MS) {
    return { count: Math.floor(elapsedMs / MONTH_MS), unit: "mo" };
  }

  return { count: Math.floor(elapsedMs / YEAR_MS), unit: "y" };
}
