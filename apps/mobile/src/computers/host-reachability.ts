import { useSyncExternalStore } from "react";
import { hostConnection } from "@/connection";
import { hosts } from "@/hosts";

export type HostReachability =
  | { state: "checking" }
  | { state: "online"; latencyMs: number }
  | { state: "offline" }
  | { state: "unauthorized" };

const PROBE_INTERVAL_MS = 10_000;
const PROBE_TIMEOUT_MS = 5_000;
const CHECKING: HostReachability = { state: "checking" };

let results: ReadonlyMap<string, HostReachability> = new Map();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function publish(hostId: string, reachability: HostReachability) {
  const next = new Map(results);
  next.set(hostId, reachability);
  results = next;
  for (const listener of listeners) listener();
}

function reachabilityFromError(error: unknown): HostReachability {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "UNAUTHORIZED"
    ? { state: "unauthorized" }
    : { state: "offline" };
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
    publish(hostId, reachabilityFromError(error));
  }
}

function probeAll() {
  for (const host of hosts.getSnapshot()) void probe(host.hostId);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    probeAll();
    timer = setInterval(probeAll, PROBE_INTERVAL_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0 || !timer) return;
    clearInterval(timer);
    timer = null;
  };
}

export function useHostReachability(hostId: string): HostReachability {
  const snapshot = useSyncExternalStore(subscribe, () => results);
  return snapshot.get(hostId) ?? CHECKING;
}
