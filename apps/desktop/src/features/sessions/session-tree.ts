import type { SessionRecord } from "@cocurdex/shared";

export interface FlatSessionNode {
  depth: number;
  hasChildren: boolean;
  session: SessionRecord;
}

function sessionActivityAt(session: SessionRecord) {
  return session.lastMessageAt ?? session.createdAt;
}

function parentIdOf(session: SessionRecord) {
  return session.parentSessionId ?? null;
}

function groupChildren(sessions: SessionRecord[]) {
  const childrenByParent = new Map<string | null, SessionRecord[]>();
  for (const session of sessions) {
    const parentId = parentIdOf(session);
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(session);
    childrenByParent.set(parentId, siblings);
  }
  return childrenByParent;
}

function subtreeActivityAt(
  session: SessionRecord,
  childrenByParent: Map<string | null, SessionRecord[]>,
): string {
  let latest = sessionActivityAt(session);
  for (const child of childrenByParent.get(session.id) ?? []) {
    const childLatest = subtreeActivityAt(child, childrenByParent);
    if (childLatest.localeCompare(latest) > 0) {
      latest = childLatest;
    }
  }
  return latest;
}

function sortRoots(
  sessions: SessionRecord[],
  childrenByParent: Map<string | null, SessionRecord[]>,
) {
  return [...sessions].sort((left, right) => {
    const byActivity = subtreeActivityAt(right, childrenByParent).localeCompare(
      subtreeActivityAt(left, childrenByParent),
    );
    return byActivity !== 0 ? byActivity : right.id.localeCompare(left.id);
  });
}

function sortSpawnOrder(sessions: SessionRecord[]) {
  return [...sessions].sort((left, right) => {
    const byCreated = left.createdAt.localeCompare(right.createdAt);
    return byCreated !== 0 ? byCreated : left.id.localeCompare(right.id);
  });
}

export function isSubagentSession(
  session: Pick<SessionRecord, "parentSessionId" | "sessionKind">,
) {
  return session.sessionKind === "subagent" || Boolean(session.parentSessionId);
}

export function collectSessionSubtreeIds(
  sessions: SessionRecord[],
  rootId: string,
) {
  const childrenByParent = groupChildren(sessions);
  const ids = new Set<string>([rootId]);
  const stack = [rootId];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    for (const child of childrenByParent.get(current) ?? []) {
      if (ids.has(child.id)) {
        continue;
      }
      ids.add(child.id);
      stack.push(child.id);
    }
  }

  return ids;
}

export function buildVisibleSessionTree(
  sessions: SessionRecord[],
): FlatSessionNode[] {
  const byId = new Map(sessions.map((session) => [session.id, session]));
  const childrenByParent = groupChildren(sessions);
  const result: FlatSessionNode[] = [];
  const visited = new Set<string>();

  const walk = (session: SessionRecord, depth: number) => {
    if (visited.has(session.id)) {
      return;
    }
    visited.add(session.id);
    const children = sortSpawnOrder(childrenByParent.get(session.id) ?? []);
    result.push({
      depth,
      hasChildren: children.length > 0,
      session,
    });
    for (const child of children) {
      walk(child, depth + 1);
    }
  };

  const roots = sortRoots(
    (childrenByParent.get(null) ?? []).filter((session) => {
      const parentId = parentIdOf(session);
      return !parentId || !byId.has(parentId);
    }),
    childrenByParent,
  );

  for (const root of roots) {
    walk(root, 0);
  }

  const orphans = sortRoots(
    sessions.filter((session) => !visited.has(session.id)),
    childrenByParent,
  );
  for (const orphan of orphans) {
    walk(orphan, 0);
  }

  return result;
}
