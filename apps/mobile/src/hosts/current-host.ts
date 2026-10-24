import type { SavedHost } from "@cocurdex/client-runtime";

export function pickCurrentHost(
  saved: readonly SavedHost[],
  selectedHostId: string | null,
): SavedHost | null {
  return (
    saved.find((host) => host.hostId === selectedHostId) ?? saved[0] ?? null
  );
}
