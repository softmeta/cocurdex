import {
  isChatSession,
  SESSION_PRIMARY_STATE_PRIORITY,
  type SessionAttentionSnapshot,
  type SessionPrimaryState,
  type SessionRecord,
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
}

export interface SessionSection {
  workspaceId: string;
  title: string;
  rows: SessionRow[];
}

export interface SessionSectionsInput {
  workspaces: readonly WorkspaceRecord[];
  sessions: readonly SessionRecord[];
  attention: readonly SessionAttentionSnapshot[];
  query: string;
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

export function sessionRowStatus(state: SessionPrimaryState): SessionRowStatus {
  return ROW_STATUS[state];
}

function moreUrgent(left: SessionPrimaryState, right: SessionPrimaryState) {
  return (STATE_RANK.get(left) ?? 0) <= (STATE_RANK.get(right) ?? 0)
    ? left
    : right;
}

function topLevelIds(sessions: readonly SessionRecord[]) {
  const parents = new Map(
    sessions.map((session) => [session.id, session.parentSessionId ?? null]),
  );
  const rootOf = (id: string) => {
    let current = id;
    const seen = new Set<string>();
    for (;;) {
      const parent = parents.get(current) ?? null;
      if (!parent || !parents.has(parent) || seen.has(parent)) return current;
      seen.add(current);
      current = parent;
    }
  };
  return new Map(sessions.map((session) => [session.id, rootOf(session.id)]));
}

function rolledUpStates(
  sessions: readonly SessionRecord[],
  attention: readonly SessionAttentionSnapshot[],
) {
  const roots = topLevelIds(sessions);
  const states = new Map<string, SessionPrimaryState>();
  for (const snapshot of attention) {
    const root = roots.get(snapshot.sessionId);
    if (!root) continue;
    const current = states.get(root);
    states.set(
      root,
      current
        ? moreUrgent(current, snapshot.primaryState)
        : snapshot.primaryState,
    );
  }
  return states;
}

function isListed(session: SessionRecord) {
  return !(
    session.parentSessionId ||
    session.archivedAt ||
    isChatSession(session)
  );
}

function matches(query: string, ...texts: string[]) {
  return texts.some((text) => text.toLocaleLowerCase().includes(query));
}

const byNewest = (left: SessionRow, right: SessionRow) =>
  right.activityAt.localeCompare(left.activityAt);

const latest = (section: SessionSection) => section.rows[0]?.activityAt ?? "";

export function buildSessionSections(
  input: SessionSectionsInput,
): SessionSection[] {
  const query = input.query.trim().toLocaleLowerCase();
  const states = rolledUpStates(input.sessions, input.attention);
  const workspaces = new Map(
    input.workspaces.map((workspace) => [workspace.id, workspace]),
  );
  const rowsByWorkspace = new Map<string, SessionRow[]>();

  for (const session of input.sessions) {
    const workspace = workspaces.get(session.workspaceId);
    if (!(workspace && isListed(session))) continue;
    if (query && !matches(query, session.title, workspace.name)) continue;
    const rows = rowsByWorkspace.get(workspace.id) ?? [];
    rows.push({
      id: session.id,
      title: session.title,
      activityAt: session.lastMessageAt ?? session.updatedAt,
      state: states.get(session.id) ?? "ready",
    });
    rowsByWorkspace.set(workspace.id, rows);
  }

  return [...rowsByWorkspace]
    .map(([workspaceId, rows]) => ({
      workspaceId,
      title: workspaces.get(workspaceId)?.name ?? workspaceId,
      rows: rows.sort(byNewest),
    }))
    .sort((left, right) => latest(right).localeCompare(latest(left)));
}
