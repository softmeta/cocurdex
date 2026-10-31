import type { SessionRecord } from "@cocurdex/shared";
import { atom } from "jotai";

export interface ArchiveGroupRequest {
  label: string;
  sessions: readonly SessionRecord[];
}

export const archiveGroupRequestAtom = atom<ArchiveGroupRequest | null>(null);

export function rootSessionIds(sessions: readonly SessionRecord[]) {
  const ids = new Set(sessions.map((session) => session.id));
  return sessions
    .filter(
      (session) =>
        !session.parentSessionId || !ids.has(session.parentSessionId),
    )
    .map((session) => session.id);
}
