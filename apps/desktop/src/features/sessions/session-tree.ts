import type { SessionRecord } from "@cocurdex/shared";

export type SessionRootOrder = "activity" | "created";

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

export function groupChildren(sessions: readonly SessionRecord[]) {
  const childrenByParent = new Map<string | null, SessionRecord[]>();
  for (const session of sessions) {
    const parentId = parentIdOf(session);
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(session);
    childrenByParent.set(parentId, siblings);
  }
  return childrenByParent;
}

export function subtreeActivityAt(
  session: SessionRecord,
  childrenByParent: ReadonlyMap<string | null, SessionRecord[]>,
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

function rootSortKey(
  session: SessionRecord,
  childrenByParent: Map<string | null, SessionRecord[]>,
  order: SessionRootOrder,
) {
  return order === "created"
    ? session.createdAt
    : subtreeActivityAt(session, childrenByParent);
}

function sortRoots(
  sessions: SessionRecord[],
  childrenByParent: Map<string | null, SessionRecord[]>,
  order: SessionRootOrder,
) {
  return [...sessions].sort((left, right) => {
    const byKey = rootSortKey(right, childrenByParent, order).localeCompare(
      rootSortKey(left, childrenByParent, order),
    );
    return byKey !== 0 ? byKey : right.id.localeCompare(left.id);
  });
}

function sortSpawnOrder(sessions: SessionRecord[]) {
  return [...sessions].sort((left, right) => {
    const byCreated = left.createdAt.localeCompare(right.createdAt);
    return byCreated !== 0 ? byCreated : left.id.localeCompare(right.id);
  });
}

export function isSubagentSession(session: Pick<SessionRecord, "sessionKind">) {
  return session.sessionKind === "subagent";
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

export function sessionAncestorIds(
  sessionId: string,
  sessions: SessionRecord[],
) {
  const byId = new Map(sessions.map((session) => [session.id, session]));
  const ids: string[] = [];
  const visited = new Set<string>();
  let current = byId.get(sessionId);

  while (current) {
    const parentId = parentIdOf(current);
    if (!parentId || visited.has(parentId)) {
      break;
    }
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) {
      break;
    }
    ids.push(parent.id);
    current = parent;
  }

  return ids;
}

export function buildVisibleSessionTree(
  sessions: SessionRecord[],
  collapsedIds: ReadonlySet<string> = new Set(),
  order: SessionRootOrder = "activity",
): FlatSessionNode[] {
  const byId = new Map(sessions.map((session) => [session.id, session]));
  const childrenByParent = groupChildren(sessions);
  const result: FlatSessionNode[] = [];
  const visited = new Set<string>();

  const markDescendantsVisited = (sessionId: string) => {
    for (const child of childrenByParent.get(sessionId) ?? []) {
      visited.add(child.id);
      markDescendantsVisited(child.id);
    }
  };

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
    if (collapsedIds.has(session.id)) {
      markDescendantsVisited(session.id);
      return;
    }
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
    order,
  );

  for (const root of roots) {
    walk(root, 0);
  }

  const orphans = sortRoots(
    sessions.filter((session) => !visited.has(session.id)),
    childrenByParent,
    order,
  );
  for (const orphan of orphans) {
    walk(orphan, 0);
  }

  return result;
}

export function rootSessionId(
  sessionId: string,
  byId: ReadonlyMap<string, SessionRecord>,
) {
  let currentId = sessionId;
  const visited = new Set<string>();
  while (!visited.has(currentId)) {
    visited.add(currentId);
    const parentId = byId.get(currentId)?.parentSessionId;
    if (!parentId || !byId.has(parentId)) {
      break;
    }
    currentId = parentId;
  }
  return currentId;
}

export interface LimitedSessionTree {
  hiddenRootCount: number;
  nodes: FlatSessionNode[];
}

export function limitSessionTreeRoots(
  nodes: FlatSessionNode[],
  sessions: SessionRecord[],
  rootLimit: number,
  keepVisibleIds: Iterable<string>,
): LimitedSessionTree {
  const byId = new Map(sessions.map((session) => [session.id, session]));
  const keptRootIds = new Set(
    [...keepVisibleIds].map((id) => rootSessionId(id, byId)),
  );
  const result: FlatSessionNode[] = [];
  let rootIndex = -1;
  let hiddenRootCount = 0;
  let keepCurrentRoot = false;

  for (const node of nodes) {
    if (node.depth === 0) {
      rootIndex += 1;
      keepCurrentRoot =
        rootIndex < rootLimit || keptRootIds.has(node.session.id);
      if (!keepCurrentRoot) {
        hiddenRootCount += 1;
      }
    }
    if (keepCurrentRoot) {
      result.push(node);
    }
  }

  return { hiddenRootCount, nodes: result };
}
