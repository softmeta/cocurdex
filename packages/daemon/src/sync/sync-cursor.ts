import type { SyncClock } from "@cocurdex/db";

const CURSOR_PATTERN = /^v1\.([a-f0-9]{32})\.(\d{1,15})$/;

export function formatSyncCursor(clock: Pick<SyncClock, "databaseId" | "seq">) {
  return `v1.${clock.databaseId}.${clock.seq}`;
}

export function resolveSyncCursor(
  cursor: string | null | undefined,
  clock: SyncClock,
): number | null {
  const match = cursor ? CURSOR_PATTERN.exec(cursor) : null;
  if (!match || match[1] !== clock.databaseId) return null;
  const seq = Number(match[2]);
  if (seq > clock.seq || seq < clock.tombstoneFloor) return null;
  return seq;
}
