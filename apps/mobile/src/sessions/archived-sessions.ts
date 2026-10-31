import {
  isChatSession,
  type SessionRecord,
  type WorkspaceRecord,
} from "@cocurdex/shared";

export interface ArchivedSessionRow {
  id: string;
  title: string;
  agentType: SessionRecord["agentType"];
  workspaceName: string | null;
  archivedAt: string;
}

export function archivedSessionRows(
  sessions: readonly SessionRecord[],
  workspaces: readonly WorkspaceRecord[],
): ArchivedSessionRow[] {
  const names = new Map(workspaces.map((entry) => [entry.id, entry.name]));
  return sessions
    .flatMap((session) =>
      session.archivedAt && !session.parentSessionId && !isChatSession(session)
        ? [
            {
              id: session.id,
              title: session.title,
              agentType: session.agentType,
              workspaceName: names.get(session.workspaceId) ?? null,
              archivedAt: session.archivedAt,
            },
          ]
        : [],
    )
    .sort((left, right) => right.archivedAt.localeCompare(left.archivedAt));
}
