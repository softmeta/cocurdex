import { useSyncExternalStore } from "react";
import { AppState, type NativeEventSubscription } from "react-native";
import { hostConnection } from "@/connection";
import { hosts } from "@/hosts";

export type HostReachability =
  | { state: "checking" }
  | { state: "online"; latencyMs: number }
  | { state: "offline" }
  | { state: "pending" }
  | { state: "unauthorized" };

const PROBE_TIMEOUT_MS = 5_000;
const PENDING_REPROBE_MS = 5_000;
const CHECKING: HostReachability = { state: "checking" };

let results: ReadonlyMap<string, HostReachability> = new Map();
const listeners = new Set<() => void>();
let foreground: NativeEventSubscription | null = null;

function publish(hostId: string, reachability: HostReachability) {
  const next = new Map(results);
  next.set(hostId, reachability);
  results = next;
  for (const listener of listeners) listener();
}

function reachabilityFromError(error: unknown): HostReachability {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "UNAUTHORIZED") return { state: "unauthorized" };
  if (code === "PENDING_APPROVAL") return { state: "pending" };
  return { state: "offline" };
}

async function probe(hostId: string) {
  const connection = hostConnection(hostId);
  const options = { timeoutMs: PROBE_TIMEOUT_MS };
  try {
    await connection.request("daemon.health", undefined, options);
    const started = performance.now();
    await connection.request("daemon.health", undefined, options);
    const latencyMs = Math.max(1, Math.round(performance.now() - started));
    publish(hostId, { state: "online", latencyMs });
  } catch (error) {
    const reachability = reachabilityFromError(error);
    publish(hostId, reachability);
    if (reachability.state === "pending") {
      setTimeout(() => {
        if (listeners.size > 0) void probe(hostId);
      }, PENDING_REPROBE_MS);
    }
  }
}

export function refreshHostReachability() {
  return Promise.all(hosts.getSnapshot().map((host) => probe(host.hostId)));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!foreground) {
    void refreshHostReachability();
    foreground = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshHostReachability();
    });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0 || !foreground) return;
    foreground.remove();
    foreground = null;
  };
}

export function whenHostOnline(hostId: string, onOnline: () => void) {
  let seen = results.get(hostId);
  const unsubscribe = subscribe(() => {
    const current = results.get(hostId);
    if (current === seen) return;
    seen = current;
    if (current?.state === "online") onOnline();
  });
  void probe(hostId);
  return unsubscribe;
}

export function useHostReachability(hostId: string): HostReachability {
  const snapshot = useSyncExternalStore(subscribe, () => results);
  return snapshot.get(hostId) ?? CHECKING;
}
