import {
  isManualProxyIncomplete,
  type NetworkProxySettings,
  type NetworkProxyTestResult,
} from "@cocurdex/shared";
import { useSyncExternalStore } from "react";
import { desktopApi } from "@/lib";

const STALE_MS = 30_000;

export interface NetworkProxyStatusSnapshot {
  settings: NetworkProxySettings | null;
  result: NetworkProxyTestResult | null;
  testing: boolean;
  probedAt: number | null;
}

const listeners = new Set<() => void>();

let snapshot: NetworkProxyStatusSnapshot = {
  settings: null,
  result: null,
  testing: false,
  probedAt: null,
};
let probeGeneration = 0;
let loadPromise: Promise<void> | null = null;

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function setSnapshot(next: Partial<NetworkProxyStatusSnapshot>) {
  snapshot = { ...snapshot, ...next };
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot(): NetworkProxyStatusSnapshot {
  return snapshot;
}

export function useNetworkProxyStatus(): NetworkProxyStatusSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function applyNetworkProxySettingsToStatus(
  settings: NetworkProxySettings,
) {
  probeGeneration += 1;
  setSnapshot({
    settings,
    result: null,
    probedAt: null,
    testing: false,
  });
}

export function applyNetworkProxyProbeToStatus(
  settings: NetworkProxySettings,
  result: NetworkProxyTestResult,
) {
  probeGeneration += 1;
  setSnapshot({
    settings,
    result,
    probedAt: Date.now(),
    testing: false,
  });
}

export function loadNetworkProxyStatus(): Promise<void> {
  if (!loadPromise) {
    loadPromise = desktopApi
      .getNetworkProxySettings()
      .then((settings) => {
        if (snapshot.settings === null) {
          setSnapshot({ settings });
        }
      })
      .catch(() => {
        loadPromise = null;
      });
  }
  return loadPromise;
}

export function shouldProbeNetworkProxyStatus(
  status: NetworkProxyStatusSnapshot = snapshot,
): boolean {
  if (status.testing) {
    return false;
  }
  if (!status.settings || isManualProxyIncomplete(status.settings)) {
    return false;
  }
  if (status.probedAt === null) {
    return true;
  }
  return Date.now() - status.probedAt > STALE_MS;
}

export async function probeCurrentNetworkProxyStatus(): Promise<void> {
  if (snapshot.testing) {
    return;
  }
  const generation = ++probeGeneration;
  setSnapshot({ testing: true });
  try {
    const result = await desktopApi.testCurrentNetworkProxy();
    if (generation !== probeGeneration) {
      return;
    }
    setSnapshot({
      result,
      testing: false,
      probedAt: Date.now(),
    });
  } catch (error) {
    if (generation !== probeGeneration) {
      return;
    }
    setSnapshot({
      testing: false,
      probedAt: Date.now(),
      result: {
        ok: false,
        durationMs: 0,
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
