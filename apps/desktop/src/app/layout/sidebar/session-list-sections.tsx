import type { SessionRecord } from "@cocurdex/shared";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SidebarMenuItem } from "@/components/ui";
import { SidebarSectionHeading } from "./sidebar-section-heading";
import { SidebarSessionTree } from "./sidebar-session-tree";
import { useSidebarSectionCollapse } from "./use-sidebar-section-collapse";

interface SessionListSectionsProps {
  headingActions?: ReactNode;
  optimisticActiveSessionId: string | null;
  sessions: SessionRecord[];
  workspaceNames: ReadonlyMap<string, string>;
  onSelectSession(workspaceId: string, sessionId: string): void;
}

export function SessionListSections({
  headingActions,
  optimisticActiveSessionId,
  sessions,
  workspaceNames,
  onSelectSession,
}: SessionListSectionsProps) {
  const { t } = useTranslation("sessions");
  const pinned = useSidebarSectionCollapse("pinned");

  return (
    <>
      {sessions.length > 0 ? (
        <SidebarMenuItem className="flex flex-col gap-0.5 pb-3">
          <SidebarSectionHeading section="pinned">
            {t("sidebar.pinned")}
          </SidebarSectionHeading>
          {pinned.collapsed ? null : (
            <SidebarSessionTree
              emptyLabel=""
              listKey="pinned"
              onSelectSession={onSelectSession}
              optimisticActiveSessionId={optimisticActiveSessionId}
              rootLimit="all"
              sessions={sessions}
              workspaceNames={workspaceNames}
            />
          )}
        </SidebarMenuItem>
      ) : null}
      <SidebarMenuItem
        className="sticky top-0 z-10 bg-sidebar"
        data-window-sticky=""
      >
        <SidebarSectionHeading actions={headingActions} section="sessions">
          {t("sidebar.sessionsHeading")}
        </SidebarSectionHeading>
      </SidebarMenuItem>
    </>
  );
}
