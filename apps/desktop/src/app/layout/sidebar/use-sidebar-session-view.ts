import {
  type AgentId,
  isChatSession,
  type SessionRecord,
  type WorkspaceRecord,
} from "@cocurdex/shared";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useMemo } from "react";
import {
  markSessionsVisitedAtom,
  unreadSessionIdsAtom,
} from "@/features/sessions";
import {
  collapsedSessionGroupKeysAtom,
  countActiveSessionFilters,
  filterSessionsByView,
  groupSessionsByView,
  type SessionListFacts,
  sessionListViewAtom,
} from "@/features/sessions/session-list-view";
import { collapsedWorkspaceIdsAtom } from "@/features/workspaces";
import { pendingRequestSessionIdsAtom } from "./pending-request-store";
import { useIssueLinkedSessionIds } from "./use-issue-linked-session-ids";

function groupByWorkspace(sessions: readonly SessionRecord[]) {
  const byWorkspace: Record<string, SessionRecord[]> = {};
  for (const session of sessions) {
    byWorkspace[session.workspaceId] = [
      ...(byWorkspace[session.workspaceId] ?? []),
      session,
    ];
  }
  return byWorkspace;
}

function collectAgentIds(
  sessions: readonly SessionRecord[],
  selected: readonly AgentId[],
) {
  const ids = new Set<AgentId>(selected);
  for (const session of sessions) {
    ids.add(session.agentType);
  }
  return [...ids].sort((left, right) => left.localeCompare(right));
}

export function useSidebarSessionView(
  workspaces: WorkspaceRecord[],
  sessions: readonly SessionRecord[],
) {
  const view = useAtomValue(sessionListViewAtom);
  const attentionIds = useAtomValue(pendingRequestSessionIdsAtom);
  const unreadIds = useAtomValue(unreadSessionIdsAtom);
  const markSessionsVisited = useSetAtom(markSessionsVisitedAtom);
  const [collapsedWorkspaceIds, setCollapsedWorkspaceIds] = useAtom(
    collapsedWorkspaceIdsAtom,
  );
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useAtom(
    collapsedSessionGroupKeysAtom,
  );
  const issueLinkedIds = useIssueLinkedSessionIds(view.sources.length > 0);
  const filtered = countActiveSessionFilters(view) > 0;

  const workSessions = useMemo(
    () => sessions.filter((session) => !isChatSession(session)),
    [sessions],
  );
  const facts: SessionListFacts = useMemo(
    () => ({ attentionIds, issueLinkedIds, unreadIds }),
    [attentionIds, issueLinkedIds, unreadIds],
  );
  const visibleSessions = useMemo(
    () => filterSessionsByView(workSessions, view, facts),
    [workSessions, view, facts],
  );
  const sessionsByWorkspace = useMemo(
    () => groupByWorkspace(visibleSessions),
    [visibleSessions],
  );
  const groups =
    view.grouping === "workspace"
      ? []
      : groupSessionsByView(visibleSessions, view.grouping, facts, new Date());
  const visibleWorkspaces = filtered
    ? workspaces.filter((workspace) => sessionsByWorkspace[workspace.id])
    : workspaces;
  const workspaceNames = useMemo(
    () =>
      new Map(workspaces.map((workspace) => [workspace.id, workspace.name])),
    [workspaces],
  );

  const collapsibleKeys =
    view.grouping === "workspace"
      ? visibleWorkspaces.map((workspace) => workspace.id)
      : groups.map((group) => group.key);
  const isCollapsed = (key: string) =>
    view.grouping === "workspace"
      ? collapsedWorkspaceIds.includes(key)
      : collapsedGroupKeys.has(key);
  const allCollapsed =
    collapsibleKeys.length > 0 && collapsibleKeys.every(isCollapsed);

  const toggleCollapseAll = () => {
    if (view.grouping === "workspace") {
      setCollapsedWorkspaceIds((current) =>
        allCollapsed
          ? current.filter((id) => !collapsibleKeys.includes(id))
          : [...new Set([...current, ...collapsibleKeys])],
      );
      return;
    }
    const next = new Set(collapsedGroupKeys);
    for (const key of collapsibleKeys) {
      if (allCollapsed) {
        next.delete(key);
      } else {
        next.add(key);
      }
    }
    setCollapsedGroupKeys(next);
  };

  return {
    agentIds: collectAgentIds(workSessions, view.agents),
    allCollapsed,
    filtered,
    grouping: view.grouping,
    groups,
    sessionsByWorkspace,
    unreadCount: unreadIds.size,
    visibleWorkspaces,
    workspaceNames,
    markAllRead: () => markSessionsVisited([...unreadIds]),
    toggleCollapseAll,
  };
}
