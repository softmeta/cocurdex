import {
  type AgentId,
  buildVisibleSessionTree,
  filterSessionsByView,
  groupSessionsByView,
  isChatSession,
  limitSessionTreeRoots,
  resolveRootLimit,
  rootSessionId,
  SESSION_PRIMARY_STATE_PRIORITY,
  type SessionAttentionSnapshot,
  type SessionListFacts,
  type SessionListView,
  type SessionPrimaryState,
  type SessionRecord,
  type SessionStatusBucket,
  type SessionUpdatedBucket,
  splitPinnedSessions,
  type WorkspaceRecord,
} from "@cocurdex/shared";

export type SessionRowStatus =
  | "needs-you"
  | "failed"
  | "running"
  | "unread"
  | "none";

export interface SessionRow {
  id: string;
  title: string;
  activityAt: string;
  state: SessionPrimaryState;
  model: string | null;
  agentType: AgentId;
  roleId: string | null;
  workspaceName: string;
  depth: number;
  hasChildren: boolean;
  childCount: number;
  expanded: boolean;
  pinned: boolean;
}

export type SessionSectionHeading =
  | { kind: "pinned" }
  | { kind: "workspace"; name: string }
  | { kind: "status"; value: SessionStatusBucket }
  | { kind: "updated"; value: SessionUpdatedBucket }
  | { kind: "agent"; value: AgentId }
  | { kind: "all" };

export interface SessionSection {
  key: string;
  heading: SessionSectionHeading;
  rows: SessionRow[];
  hiddenCount: number;
}

export interface SessionSectionsInput {
  workspaces: readonly WorkspaceRecord[];
  sessions: readonly SessionRecord[];
  attention: readonly SessionAttentionSnapshot[];
  query: string;
  view: SessionListView;
  collapsedIds: ReadonlySet<string>;
  expandedSectionKeys: ReadonlySet<string>;
  now: Date;
}

const ROW_STATUS: Record<SessionPrimaryState, SessionRowStatus> = {
  "pending-approval": "needs-you",
  "awaiting-input": "needs-you",
  "plan-ready": "needs-you",
  failed: "failed",
  working: "running",
  connecting: "running",
  monitoring: "running",
  "completed-unread": "unread",
  ready: "none",
};

const STATE_RANK = new Map<SessionPrimaryState, number>(
  SESSION_PRIMARY_STATE_PRIORITY.map((state, index) => [state, index]),
);

export const PINNED_SECTION_KEY = "pinned";

export function sessionRowStatus(state: SessionPrimaryState): SessionRowStatus {
  return ROW_STATUS[state];
}

function moreUrgent(left: SessionPrimaryState, right: SessionPrimaryState) {
  return (STATE_RANK.get(left) ?? 0) <= (STATE_RANK.get(right) ?? 0)
    ? left
    : right;
}

function listFacts(
  attention: readonly SessionAttentionSnapshot[],
): SessionListFacts {
  const attentionIds = new Set<string>();
  const unreadIds = new Set<string>();
  for (const snapshot of attention) {
    const status = sessionRowStatus(snapshot.primaryState);
    if (status === "needs-you") attentionIds.add(snapshot.sessionId);
    if (status === "unread") unreadIds.add(snapshot.sessionId);
  }
  return { attentionIds, unreadIds, issueLinkedIds: new Set() };
}

function treesByRoot(sessions: readonly SessionRecord[]) {
  const byId = new Map(sessions.map((session) => [session.id, session]));
  const trees = new Map<string, SessionRecord[]>();
  for (const session of sessions) {
    const rootId = rootSessionId(session.id, byId);
    trees.set(rootId, [...(trees.get(rootId) ?? []), session]);
  }
  return trees;
}

function matchingTrees(
  sessions: readonly SessionRecord[],
  query: string,
  workspaceName: (session: SessionRecord) => string,
) {
  if (!query) return [...sessions];
  const matches = (text: string) => text.toLocaleLowerCase().includes(query);
  return [...treesByRoot(sessions).values()]
    .filter((tree) =>
      tree.some(
        (session) => matches(session.title) || matches(workspaceName(session)),
      ),
    )
    .flat();
}

function subtreeStates(
  sessions: readonly SessionRecord[],
  states: ReadonlyMap<string, SessionPrimaryState>,
) {
  const rolled = new Map<string, SessionPrimaryState>();
  const byId = new Map(sessions.map((session) => [session.id, session]));
  for (const session of sessions) {
    const own = states.get(session.id);
    if (!own) continue;
    const visited = new Set<string>();
    let current: SessionRecord | undefined = session;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      const previous = rolled.get(current.id);
      rolled.set(current.id, previous ? moreUrgent(previous, own) : own);
      const parentId: string | null | undefined = current.parentSessionId;
      current = parentId ? byId.get(parentId) : undefined;
    }
  }
  return rolled;
}

function latestActivity(rows: readonly SessionRow[]) {
  return rows.reduce(
    (latest, row) => (row.activityAt > latest ? row.activityAt : latest),
    "",
  );
}

export function buildSessionSections(
  input: SessionSectionsInput,
): SessionSection[] {
  const query = input.query.trim().toLocaleLowerCase();
  const workspaces = new Map(
    input.workspaces.map((workspace) => [workspace.id, workspace]),
  );
  const workspaceName = (session: SessionRecord) =>
    workspaces.get(session.workspaceId)?.name ?? "";
  const listed = input.sessions.filter(
    (session) =>
      workspaces.has(session.workspaceId) &&
      !session.archivedAt &&
      !isChatSession(session),
  );
  const searched = matchingTrees(listed, query, workspaceName);
  const facts = listFacts(input.attention);
  const states = new Map(
    input.attention.map((snapshot) => [
      snapshot.sessionId,
      snapshot.primaryState,
    ]),
  );
  const rolledStates = subtreeStates(searched, states);
  const keepVisible = searched
    .filter((session) => {
      const status = sessionRowStatus(states.get(session.id) ?? "ready");
      return status === "needs-you" || status === "running";
    })
    .map((session) => session.id);
  const { pinned, unpinned } = splitPinnedSessions(searched);

  const section = (
    key: string,
    heading: SessionSectionHeading,
    sessions: SessionRecord[],
    limited: boolean,
  ): SessionSection => {
    const nodes = buildVisibleSessionTree(
      sessions,
      input.collapsedIds,
      input.view.ordering,
      input.view.direction,
    );
    const rootLimit =
      limited && !query && !input.expandedSectionKeys.has(key)
        ? resolveRootLimit(input.view.rootLimit)
        : Number.POSITIVE_INFINITY;
    const shown = limitSessionTreeRoots(
      nodes,
      sessions,
      rootLimit,
      keepVisible,
    );
    const childCounts = new Map<string, number>();
    for (const session of sessions) {
      const parentId = session.parentSessionId;
      if (parentId)
        childCounts.set(parentId, (childCounts.get(parentId) ?? 0) + 1);
    }
    const rows = shown.nodes.map(({ session, depth, hasChildren }) => {
      const expanded = !input.collapsedIds.has(session.id);
      const stateMap = hasChildren && !expanded ? rolledStates : states;
      return {
        id: session.id,
        title: session.title,
        activityAt: session.lastMessageAt ?? session.updatedAt,
        state: stateMap.get(session.id) ?? "ready",
        model: session.providerSnapshot?.modelName ?? null,
        agentType: session.agentType,
        roleId: session.agentRoleId ?? null,
        workspaceName: workspaceName(session),
        depth,
        hasChildren,
        childCount: childCounts.get(session.id) ?? 0,
        expanded,
        pinned: Boolean(session.pinnedAt),
      };
    });
    return { key, heading, rows, hiddenCount: shown.hiddenRootCount };
  };

  const sections: SessionSection[] = [];
  if (pinned.length > 0) {
    sections.push(
      section(PINNED_SECTION_KEY, { kind: "pinned" }, pinned, false),
    );
  }
  const filtered = filterSessionsByView(unpinned, input.view, facts);
  if (input.view.grouping === "workspace") {
    const byWorkspace = new Map<string, SessionRecord[]>();
    for (const session of filtered) {
      byWorkspace.set(session.workspaceId, [
        ...(byWorkspace.get(session.workspaceId) ?? []),
        session,
      ]);
    }
    const workspaceSections = [...byWorkspace].map(([workspaceId, group]) =>
      section(
        `workspace:${workspaceId}`,
        { kind: "workspace", name: workspaces.get(workspaceId)?.name ?? "" },
        group,
        true,
      ),
    );
    return [
      ...sections,
      ...workspaceSections.sort((left, right) =>
        latestActivity(right.rows).localeCompare(latestActivity(left.rows)),
      ),
    ];
  }
  for (const group of groupSessionsByView(
    filtered,
    input.view.grouping,
    facts,
    input.now,
  )) {
    sections.push(
      section(
        group.key,
        groupHeading(input.view.grouping, group.value),
        [...group.sessions],
        true,
      ),
    );
  }
  return sections;
}

function groupHeading(
  grouping: Exclude<SessionListView["grouping"], "workspace">,
  value: string,
): SessionSectionHeading {
  if (grouping === "status") {
    return { kind: "status", value: value as SessionStatusBucket };
  }
  if (grouping === "updated") {
    return { kind: "updated", value: value as SessionUpdatedBucket };
  }
  if (grouping === "agent") return { kind: "agent", value: value as AgentId };
  return { kind: "all" };
}
