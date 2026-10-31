import type { HostBridge } from "./types";

export function getHostBridge(): HostBridge | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.desktopApi ?? null;
}
