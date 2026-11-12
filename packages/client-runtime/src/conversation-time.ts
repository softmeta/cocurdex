const SEPARATOR_GAP_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfLocalDay(time: number) {
  const date = new Date(time);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

export function parseConversationTime(value: string | undefined) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

export function conversationSeparatorTime(
  previousEnd: number | null,
  start: number | null,
): number | null {
  if (start === null) return null;
  if (previousEnd === null) return start;
  const isNewDay = startOfLocalDay(start) !== startOfLocalDay(previousEnd);
  return isNewDay || start - previousEnd >= SEPARATOR_GAP_MS ? start : null;
}

function capitalize(text: string, locale: string) {
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

export function formatSeparatorTime(time: number, now: number, locale: string) {
  const clock = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  }).format(time);
  const days = Math.round(
    (startOfLocalDay(now) - startOfLocalDay(time)) / DAY_MS,
  );
  if (days === 0) return clock;
  if (days === 1) {
    const yesterday = new Intl.RelativeTimeFormat(locale, {
      numeric: "auto",
    }).format(-1, "day");
    return `${capitalize(yesterday, locale)} ${clock}`;
  }
  const sameYear = new Date(time).getFullYear() === new Date(now).getFullYear();
  const dateOptions: Intl.DateTimeFormatOptions =
    days > 1 && days < 7
      ? { weekday: "long" }
      : {
          month: "short",
          day: "numeric",
          year: sameYear ? undefined : "numeric",
        };
  const date = new Intl.DateTimeFormat(locale, dateOptions).format(time);
  return `${date} ${clock}`;
}
