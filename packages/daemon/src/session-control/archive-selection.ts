import type { SessionRecord } from "@cocurdex/shared";

export interface ArchiveSelection {
  rootIds: string[];
  skippedCount: number;
}

function collectChildren(sessions: readonly SessionRecord[]) {
  const children = new Map<string, SessionRecord[]>();
  for (const session of sessions) {
    if (!session.parentSessionId) {
      continue;
    }
    children.set(session.parentSessionId, [
      ...(children.get(session.parentSessionId) ?? []),
      session,
    ]);
  }
  return children;
}

function treeIsBusy(
  root: SessionRecord,
  children: ReadonlyMap<string, readonly SessionRecord[]>,
  isBusy: (sessionId: string) => boolean,
) {
  const pending = [root];
  const seen = new Set<string>();
  while (pending.length > 0) {
    const session = pending.pop();
    if (!session || seen.has(session.id)) {
      continue;
    }
    seen.add(session.id);
    if (session.status === "running" || isBusy(session.id)) {
      return true;
    }
    pending.push(...(children.get(session.id) ?? []));
  }
  return false;
}

export function selectArchivableRoots(
  sessions: readonly SessionRecord[],
  requestedIds: readonly string[],
  isBusy: (sessionId: string) => boolean,
): ArchiveSelection {
  const byId = new Map(sessions.map((session) => [session.id, session]));
  const children = collectChildren(sessions);
  const rootIds: string[] = [];
  let skippedCount = 0;

  for (const id of new Set(requestedIds)) {
    const session = byId.get(id);
    const isRoot =
      session !== undefined &&
      (!session.parentSessionId || !byId.has(session.parentSessionId));
    if (!session || !isRoot) {
      continue;
    }
    if (session.pinnedAt || treeIsBusy(session, children, isBusy)) {
      skippedCount += 1;
      continue;
    }
    rootIds.push(id);
  }
  return { rootIds, skippedCount };
}
