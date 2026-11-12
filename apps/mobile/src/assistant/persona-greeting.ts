import type { SavedHost } from "@cocurdex/client-runtime";
import { isSupportedLocale } from "@cocurdex/shared";
import i18n from "i18next";
import { useSyncExternalStore } from "react";
import { hostConnection } from "@/connection";

const requested = new Set<string>();
const listeners = new Set<() => void>();
let snapshot: ReadonlySet<string> = new Set();

function keyOf(hostId: string, personaId: string) {
  return `${hostId}\u0000${personaId}`;
}

function publish() {
  snapshot = new Set(requested);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function greetPersonalAgent(host: SavedHost, personaId: string) {
  if (!host.scopes.includes("interact")) return;
  const key = keyOf(host.hostId, personaId);
  if (requested.has(key)) return;
  requested.add(key);
  publish();
  hostConnection(host.hostId)
    .request("personalAgent.greet", {
      id: personaId,
      locale: isSupportedLocale(i18n.language) ? i18n.language : null,
    })
    .catch(() => {
      requested.delete(key);
      publish();
    });
}

export function usePersonaGreeting(hostId: string, personaId: string | null) {
  const greeted = useSyncExternalStore(subscribe, () => snapshot);
  return personaId !== null && greeted.has(keyOf(hostId, personaId));
}
