function startOfDay(ms: number) {
  const day = new Date(ms);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

function isPreviousDay(thenMs: number, nowMs: number) {
  const yesterday = new Date(startOfDay(nowMs));
  yesterday.setDate(yesterday.getDate() - 1);
  return startOfDay(thenMs) === yesterday.getTime();
}

export function formatListTime(
  iso: string,
  nowMs: number,
  locale: string,
  yesterdayLabel: string,
): string | null {
  const thenMs = Date.parse(iso);
  if (Number.isNaN(thenMs)) return null;
  const then = new Date(thenMs);

  if (thenMs >= startOfDay(nowMs)) {
    return new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(then);
  }
  if (isPreviousDay(thenMs, nowMs)) return yesterdayLabel;

  const sameYear = then.getFullYear() === new Date(nowMs).getFullYear();
  return new Intl.DateTimeFormat(
    locale,
    sameYear
      ? { month: "short", day: "numeric" }
      : { year: "numeric", month: "numeric", day: "numeric" },
  ).format(then);
}
