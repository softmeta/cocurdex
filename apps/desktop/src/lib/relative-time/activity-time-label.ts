import {
  type CompactRelativeUnit,
  getCompactRelativeTime,
} from "@cocurdex/shared";

export interface ActivityTimeLabel {
  absolute: string;
  relative: string;
}

const RELATIVE_UNITS: Record<
  Exclude<CompactRelativeUnit, "now">,
  Intl.RelativeTimeFormatUnit
> = {
  m: "minute",
  h: "hour",
  d: "day",
  mo: "month",
  y: "year",
};

export function formatActivityTime(
  iso: string,
  nowMs: number,
  locale: string,
  nowLabel: string,
): ActivityTimeLabel | null {
  const thenMs = Date.parse(iso);
  if (Number.isNaN(thenMs)) return null;

  const { count, unit } = getCompactRelativeTime(iso, nowMs);
  const relative =
    unit === "now"
      ? nowLabel
      : new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
          -count,
          RELATIVE_UNITS[unit],
        );

  const then = new Date(thenMs);
  const sameYear = then.getFullYear() === new Date(nowMs).getFullYear();
  const absolute = new Intl.DateTimeFormat(locale, {
    year: sameYear ? undefined : "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(then);

  return { absolute, relative };
}
