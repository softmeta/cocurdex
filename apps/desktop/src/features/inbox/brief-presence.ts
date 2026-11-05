import { type Brief, briefDue, briefEntryAfterAway } from "@cocurdex/shared";
import { useSyncExternalStore } from "react";

interface BriefPresenceState {
  shownUpdatedAt: string | null;
  entryPending: boolean;
  presenting: boolean;
}

let state: BriefPresenceState = {
  shownUpdatedAt: null,
  entryPending: true,
  presenting: false,
};
let leftAt: number | null = null;
const listeners = new Set<() => void>();

function publish(next: BriefPresenceState) {
  state = next;
  for (const listener of listeners) listener();
}

function leave() {
  leftAt ??= Date.now();
}

function comeBack() {
  if (leftAt === null) return;
  const awayMs = Date.now() - leftAt;
  leftAt = null;
  if (briefEntryAfterAway(awayMs) && !state.entryPending) {
    publish({ ...state, entryPending: true });
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("blur", leave);
  window.addEventListener("focus", comeBack);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") leave();
    else if (document.hasFocus()) comeBack();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function considerBriefOnEntry(brief: Brief | null) {
  if (!state.entryPending) return;
  publish({
    ...state,
    entryPending: false,
    presenting: briefDue(brief, state.shownUpdatedAt),
  });
}

export function markBriefShown(updatedAt: string) {
  publish({ ...state, shownUpdatedAt: updatedAt, presenting: false });
}

export function useBriefPresenting() {
  return useSyncExternalStore(subscribe, () => state.presenting);
}
