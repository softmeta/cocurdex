export type ForegroundWakeup = "probe" | "reconnect";

export const SUSPENDED_RECONNECT_AFTER_MS = 10_000;

export function foregroundWakeup(
  backgroundedAt: number | null,
  activeAt: number,
): ForegroundWakeup {
  return backgroundedAt !== null &&
    activeAt - backgroundedAt >= SUSPENDED_RECONNECT_AFTER_MS
    ? "reconnect"
    : "probe";
}
