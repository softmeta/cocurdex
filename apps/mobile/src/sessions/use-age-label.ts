import { getCompactRelativeTime } from "@cocurdex/shared";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

const TICK_MS = 30_000;

let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (timer === undefined) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const notify of [...listeners]) notify();
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

export function useAgeLabel(timestamp: string) {
  const { t } = useTranslation("sessions");
  const current = useSyncExternalStore(subscribe, () => now);
  const { count, unit } = getCompactRelativeTime(timestamp, current);
  const labels = {
    now: t("age.now"),
    m: t("age.minutes", { count }),
    h: t("age.hours", { count }),
    d: t("age.days", { count }),
    mo: t("age.months", { count }),
    y: t("age.years", { count }),
  };
  return labels[unit];
}
