import type { SessionRecord } from "@cocurdex/shared";
import { MessagesSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  EmptyState,
  SidebarMenu,
  SidebarMenuItem,
  TooltipProvider,
} from "@/components/ui";
import { SessionSidebarItem } from "./session-sidebar-item";
import { SidebarScrollArea } from "./sidebar-scroll-area";

interface ChatSessionsPanelProps {
  activeSessionId: string | null;
  sessions: SessionRecord[];
  onSelectSession(sessionId: string): void;
}

export function ChatSessionsPanel({
  activeSessionId,
  sessions,
  onSelectSession,
}: ChatSessionsPanelProps) {
  const { t } = useTranslation("chat");

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

  return (
    <TooltipProvider closeDelay={80}>
      <SidebarScrollArea
        className="min-h-0 flex-1"
        viewportProps={{
          className: "overflow-x-hidden [&>div]:!block [&>div]:min-w-0",
        }}
      >
        <SidebarMenu className="pe-3">
          {sessions.map((session) => (
            <SidebarMenuItem key={session.id}>
              <SessionSidebarItem
                isActive={session.id === activeSessionId}
                onSelect={() => onSelectSession(session.id)}
                session={session}
              />
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarScrollArea>
    </TooltipProvider>
  );
}
