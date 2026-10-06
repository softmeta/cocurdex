import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { getCompactRelativeTime } from "./compact-relative-time";

const TICK_MS = 30_000;

let now = Date.now();
let timer: number | undefined;
const listeners = new Set<() => void>();

function tick() {
  now = Date.now();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (timer === undefined) {
    now = Date.now();
    timer = window.setInterval(tick, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.clearInterval(timer);
      timer = undefined;
    }
  };
}

function getSnapshot() {
  return now;
}

function useMinuteNow() {
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function useCompactAgeLabel(timestamp: string) {
  const { t } = useTranslation("sessions");
  const { count, unit } = getCompactRelativeTime(timestamp, useMinuteNow());
  const labels = {
    now: t("sidebar.ageNow"),
    m: t("sidebar.ageMinutes", { count }),
    h: t("sidebar.ageHours", { count }),
    d: t("sidebar.ageDays", { count }),
    mo: t("sidebar.ageMonths", { count }),
    y: t("sidebar.ageYears", { count }),
  };
  return labels[unit];
}
