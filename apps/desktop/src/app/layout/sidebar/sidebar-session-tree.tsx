import type { SessionRecord } from "@cocurdex/shared";
import { useAtomValue, useSetAtom } from "jotai";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  SidebarListRow,
  SidebarMenuSub,
  SidebarMenuSubItem,
} from "@/components/ui";
import {
  buildVisibleSessionTree,
  collapsedSessionIdsAtom,
  limitSessionTreeRoots,
  toggleSessionCollapsedAtom,
} from "@/features/sessions";
import {
  resolveRootLimit,
  type SessionRootLimit,
  sessionListViewAtom,
  visibleSessionProperties,
} from "@/features/sessions/session-list-view";
import { cn } from "@/lib";
import { pendingRequestSessionIdsAtom } from "./pending-request-store";
import {
  resetSessionRootLimitAtom,
  sessionRootLimitsAtom,
  showMoreSessionsAtom,
} from "./session-list-expansion-store";
import { SessionSidebarItem } from "./session-sidebar-item";

interface SidebarSessionTreeProps {
  emptyLabel: string;
  indented?: boolean;
  rootLimit?: SessionRootLimit;
  listKey: string;
  optimisticActiveSessionId: string | null;
  sessions: SessionRecord[];
  workspaceNames?: ReadonlyMap<string, string>;
  onSelectSession(workspaceId: string, sessionId: string): void;
}

export function SidebarSessionTree({
  emptyLabel,
  indented = false,
  rootLimit: rootLimitOverride,
  listKey,
  optimisticActiveSessionId,
  sessions,
  workspaceNames,
  onSelectSession,
}: SidebarSessionTreeProps) {
  const { t } = useTranslation("sessions");
  const view = useAtomValue(sessionListViewAtom);
  const collapsedSessionIds = useAtomValue(collapsedSessionIdsAtom);
  const toggleSessionCollapsed = useSetAtom(toggleSessionCollapsedAtom);
  const pendingRequestSessionIds = useAtomValue(pendingRequestSessionIdsAtom);
  const sessionRootLimits = useAtomValue(sessionRootLimitsAtom);
  const showMoreSessions = useSetAtom(showMoreSessionsAtom);
  const resetSessionRootLimit = useSetAtom(resetSessionRootLimitAtom);
  const sessionTree = useMemo(
    () =>
      buildVisibleSessionTree(
        sessions,
        collapsedSessionIds,
        view.ordering,
        view.direction,
      ),
    [sessions, collapsedSessionIds, view.ordering, view.direction],
  );
  const baseLimit = resolveRootLimit(rootLimitOverride ?? view.rootLimit);
  const rootLimit = sessionRootLimits[listKey] ?? baseLimit;
  const limitedTree = limitSessionTreeRoots(
    sessionTree,
    sessions,
    rootLimit,
    sessions
      .filter(
        (session) =>
          session.status === "running" ||
          session.id === optimisticActiveSessionId ||
          pendingRequestSessionIds.has(session.id),
      )
      .map((session) => session.id),
  );
  const canShowLess = rootLimit > baseLimit;

  return (
    <SidebarMenuSub
      className={cn("ms-0", !indented && "ps-0", indented && "ps-5")}
    >
      {sessions.length === 0 ? (
        <div className="ps-1 pe-2 py-1 text-meta text-sidebar-fg-subtle">
          {emptyLabel}
        </div>
      ) : (
        limitedTree.nodes.map((node) => (
          <SidebarMenuSubItem key={node.session.id}>
            <SessionSidebarItem
              hasChildren={node.hasChildren}
              isActive={node.session.id === optimisticActiveSessionId}
              isExpanded={!collapsedSessionIds.has(node.session.id)}
              onSelect={() =>
                onSelectSession(node.session.workspaceId, node.session.id)
              }
              onToggleExpand={() => toggleSessionCollapsed(node.session.id)}
              session={node.session}
              properties={visibleSessionProperties(view)}
              workspaceName={workspaceNames?.get(node.session.workspaceId)}
            />
          </SidebarMenuSubItem>
        ))
      )}
      {limitedTree.hiddenRootCount > 0 || canShowLess ? (
        <SidebarMenuSubItem>
          <SidebarListRow className="gap-3 ps-1 text-meta text-sidebar-fg-subtle">
            {limitedTree.hiddenRootCount > 0 ? (
              <button
                type="button"
                className="min-w-0 truncate text-start hover:text-sidebar-fg"
                onClick={() => showMoreSessions({ listKey, baseLimit })}
              >
                {t("sidebar.showMore", {
                  count: limitedTree.hiddenRootCount,
                })}
              </button>
            ) : null}
            {canShowLess ? (
              <button
                type="button"
                className="min-w-0 truncate text-start hover:text-sidebar-fg"
                onClick={() => resetSessionRootLimit(listKey)}
              >
                {t("sidebar.showLess")}
              </button>
            ) : null}
          </SidebarListRow>
        </SidebarMenuSubItem>
      ) : null}
    </SidebarMenuSub>
  );
}
