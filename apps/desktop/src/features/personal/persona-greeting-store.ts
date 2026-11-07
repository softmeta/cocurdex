import { useEffect, useSyncExternalStore } from "react";
import { personalApi } from "./personal-api";

const requested = new Set<string>();
const listeners = new Set<() => void>();
let snapshot: ReadonlySet<string> = new Set();

function publish() {
  snapshot = new Set(requested);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function requestGreeting(personaId: string) {
  if (requested.has(personaId)) return;
  requested.add(personaId);
  publish();
  personalApi.greet(personaId).catch(() => {
    requested.delete(personaId);
    publish();
  });
}

export function usePersonaGreeting(
  personaId: string | null,
  shouldGreet: boolean,
) {
  const greeted = useSyncExternalStore(subscribe, () => snapshot);
  useEffect(() => {
    if (personaId && shouldGreet) requestGreeting(personaId);
  }, [personaId, shouldGreet]);
  return personaId !== null && greeted.has(personaId);
}
