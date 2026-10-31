import type { SessionRecord } from "@cocurdex/shared";
import { MessagesSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  EmptyState,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  TooltipProvider,
} from "@/components/ui";
import type { SessionProperty } from "@/features/sessions/session-list-view";
import { SessionSidebarItem } from "./session-sidebar-item";
import { SidebarScrollArea } from "./sidebar-scroll-area";
import { SidebarSectionHeading } from "./sidebar-section-heading";
import { useSidebarSectionCollapse } from "./use-sidebar-section-collapse";

const CHAT_SESSION_PROPERTIES: readonly SessionProperty[] = ["timestamp"];

interface ChatSessionsPanelProps {
  activeSessionId: string | null;
  sessions: SessionRecord[];
  onSelectSession(sessionId: string): void;
}

interface ChatSessionRowsProps {
  activeSessionId: string | null;
  sessions: readonly SessionRecord[];
  onSelectSession(sessionId: string): void;
}

function ChatSessionRows({
  activeSessionId,
  sessions,
  onSelectSession,
}: ChatSessionRowsProps) {
  return (
    <SidebarMenuSub className="ms-0 ps-0">
      {sessions.map((session) => (
        <SidebarMenuSubItem key={session.id}>
          <SessionSidebarItem
            isActive={session.id === activeSessionId}
            onSelect={() => onSelectSession(session.id)}
            properties={CHAT_SESSION_PROPERTIES}
            session={session}
          />
        </SidebarMenuSubItem>
      ))}
    </SidebarMenuSub>
  );
}

export function ChatSessionsPanel({
  activeSessionId,
  sessions,
  onSelectSession,
}: ChatSessionsPanelProps) {
  const { t } = useTranslation(["chat", "sessions"]);
  const pinnedSection = useSidebarSectionCollapse("chatPinned");
  const chatSection = useSidebarSectionCollapse("chat");

  if (sessions.length === 0) {
    return (
      <EmptyState
        className="px-4 py-8"
        description={t("list.empty.description")}
        icon={<MessagesSquare />}
        title={t("list.empty.title")}
      />
    );
  }

  const pinnedSessions = sessions.filter((session) => session.pinnedAt);
  const listedSessions = sessions.filter((session) => !session.pinnedAt);

  return (
    <TooltipProvider closeDelay={80}>
      <SidebarScrollArea
        className="min-h-0 flex-1"
        viewportProps={{
          className: "overflow-x-hidden [&>div]:!block [&>div]:min-w-0",
        }}
      >
        <SidebarMenu className="pe-3">
          {pinnedSessions.length > 0 ? (
            <SidebarMenuItem className="flex flex-col gap-0.5 pb-3">
              <SidebarSectionHeading section="chatPinned">
                {t("sessions:sidebar.pinned")}
              </SidebarSectionHeading>
              {pinnedSection.collapsed ? null : (
                <ChatSessionRows
                  activeSessionId={activeSessionId}
                  onSelectSession={onSelectSession}
                  sessions={pinnedSessions}
                />
              )}
            </SidebarMenuItem>
          ) : null}
          <SidebarMenuItem className="flex flex-col gap-0.5">
            <SidebarSectionHeading section="chat">
              {t("sidebar.title")}
            </SidebarSectionHeading>
            {chatSection.collapsed ? null : (
              <ChatSessionRows
                activeSessionId={activeSessionId}
                onSelectSession={onSelectSession}
                sessions={listedSessions}
              />
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarScrollArea>
    </TooltipProvider>
  );
}
