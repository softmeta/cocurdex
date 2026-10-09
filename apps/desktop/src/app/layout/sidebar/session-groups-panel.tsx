import type { AgentId } from "@cocurdex/shared";
import { useAtom } from "jotai";
import {
  BellDot,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDot,
  CircleX,
  Clock,
  History,
  type LucideIcon,
  Zap,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  SidebarListRow,
  SidebarMenu,
  SidebarMenuItem,
  Text,
  TooltipProvider,
} from "@/components/ui";
import { AgentIcon, getAgentDisplayLabel } from "@/features/sessions";
import {
  collapsedSessionGroupKeysAtom,
  type SessionGroup,
  type SessionGrouping,
  type SessionStatusBucket,
  type SessionUpdatedBucket,
} from "@/features/sessions/session-list-view";
import { SessionFilterEmpty } from "./session-filter-empty";
import { SidebarScrollArea } from "./sidebar-scroll-area";
import { SidebarSessionTree } from "./sidebar-session-tree";
import { useSessionListViewLabels } from "./use-session-list-view-labels";

type ListGrouping = Exclude<SessionGrouping, "workspace">;

const GROUP_ICONS: Readonly<Record<string, LucideIcon>> = {
  "status:attention": BellDot,
  "status:error": CircleX,
  "status:running": Zap,
  "status:unread": CircleDot,
  "status:idle": Circle,
  "updated:today": Clock,
  "updated:yesterday": History,
  "updated:week": CalendarDays,
  "updated:older": CalendarDays,
};

function SessionGroupIcon({ group }: { group: SessionGroup }) {
  if (group.key.startsWith("agent:")) {
    return <AgentIcon agentId={group.value as AgentId} className="size-3.5" />;
  }
  const Icon = GROUP_ICONS[group.key] ?? Circle;
  return <Icon className="size-3.5 shrink-0 text-sidebar-fg-subtle" />;
}

function useGroupLabel(grouping: ListGrouping) {
  const labels = useSessionListViewLabels();
  return (group: SessionGroup) => {
    if (grouping === "agent") {
      return getAgentDisplayLabel(group.value as AgentId);
    }
    if (grouping === "status") {
      return labels.status[group.value as SessionStatusBucket];
    }
    return labels.updated[group.value as SessionUpdatedBucket];
  };
}

function SessionGroupsEmpty({ filtered }: { filtered: boolean }) {
  const { t } = useTranslation("sessions");
  if (filtered) {
    return (
      <SessionFilterEmpty className="px-1 py-1 text-meta text-sidebar-fg-subtle" />
    );
  }
  return (
    <div className="px-1 py-1 text-meta text-sidebar-fg-subtle">
      {t("sidebar.noAgentsYet")}
    </div>
  );
}

interface SessionGroupsPanelProps {
  filtered: boolean;
  grouping: ListGrouping;
  groups: SessionGroup[];
  optimisticActiveSessionId: string | null;
  workspaceNames: ReadonlyMap<string, string>;
  onSelectSession(workspaceId: string, sessionId: string): void;
}

export function SessionGroupsPanel({
  filtered,
  grouping,
  groups,
  optimisticActiveSessionId,
  workspaceNames,
  onSelectSession,
}: SessionGroupsPanelProps) {
  const { t } = useTranslation("sessions");
  const [collapsedKeys, setCollapsedKeys] = useAtom(
    collapsedSessionGroupKeysAtom,
  );
  const groupLabel = useGroupLabel(grouping);

  const toggleGroup = (key: string) => {
    const next = new Set(collapsedKeys);
    if (!next.delete(key)) {
      next.add(key);
    }
    setCollapsedKeys(next);
  };

  return (
    <TooltipProvider closeDelay={80}>
      <SidebarScrollArea
        className="min-h-0 flex-1"
        viewportProps={{
          className: "overflow-x-hidden [&>div]:!block [&>div]:min-w-0",
        }}
      >
        <SidebarMenu className="pe-3">
          {groups.length === 0 ? (
            <SessionGroupsEmpty filtered={filtered} />
          ) : null}
          {groups.map((group) => {
            const expanded = !collapsedKeys.has(group.key);
            return (
              <SidebarMenuItem
                className="flex flex-col gap-0.5"
                key={group.key}
              >
                <SidebarListRow
                  variant="subtle"
                  className="px-1"
                  render={
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => toggleGroup(group.key)}
                    />
                  }
                >
                  <SessionGroupIcon group={group} />
                  <span className="min-w-0 flex-1 truncate text-start">
                    {groupLabel(group)}
                  </span>
                  <Text
                    size="meta"
                    className="shrink-0 tabular-nums text-sidebar-fg-subtle"
                  >
                    {group.rootCount}
                  </Text>
                  {expanded ? (
                    <ChevronDown className="size-3.5 shrink-0 text-sidebar-fg-subtle" />
                  ) : (
                    <ChevronRight className="size-3.5 shrink-0 text-sidebar-fg-subtle rtl:-scale-x-100" />
                  )}
                </SidebarListRow>
                {expanded ? (
                  <SidebarSessionTree
                    emptyLabel={t("sidebar.view.noMatches")}
                    listKey={group.key}
                    onSelectSession={onSelectSession}
                    optimisticActiveSessionId={optimisticActiveSessionId}
                    sessions={group.sessions}
                    workspaceNames={workspaceNames}
                  />
                ) : null}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarScrollArea>
    </TooltipProvider>
  );
}
