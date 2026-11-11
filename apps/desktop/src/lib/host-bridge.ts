import type { HostBridge } from "./types";

let override: HostBridge | null = null;

export function overrideHostBridge(bridge: HostBridge) {
  override = bridge;
}

export function getHostBridge(): HostBridge | null {
  if (typeof window === "undefined") {
    return null;
  }
  return override ?? window.desktopApi ?? null;
}
