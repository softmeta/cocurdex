import { formatElapsed } from "@cocurdex/shared";
import { useState, useSyncExternalStore } from "react";

const TICK_MS = 1000;

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

export function useElapsedLabel(startedAt: number | undefined) {
  const [mountedAt] = useState(() => Date.now());
  const current = useSyncExternalStore(subscribe, () => now);
  return formatElapsed(Math.max(0, current - (startedAt ?? mountedAt)));
}
