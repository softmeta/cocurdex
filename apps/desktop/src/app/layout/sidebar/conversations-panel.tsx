import type { ConversationRecord } from "@cocurdex/shared";
import { useAtomValue } from "jotai";
import { MessagesSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  EmptyState,
  ScrollArea,
  SidebarMenu,
  SidebarMenuItem,
  TooltipProvider,
} from "@/components/ui";
import { conversationsLoadedAtom } from "@/features/chat";
import { ConversationSidebarItem } from "./conversation-sidebar-item";

interface ConversationsPanelProps {
  activeConversationId: string | null;
  conversations: ConversationRecord[];
  onSelectConversation(conversationId: string): void;
}

// Pure chat tab of the sidebar. Conversations are workspace-independent, so
// this list is flat — no project grouping.
export function ConversationsPanel({
  activeConversationId,
  conversations,
  onSelectConversation,
}: ConversationsPanelProps) {
  const { t } = useTranslation("chat");
  const conversationsLoaded = useAtomValue(conversationsLoadedAtom);

  if (conversationsLoaded && conversations.length === 0) {
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
    <TooltipProvider closeDelay={80} delay={400}>
      <ScrollArea
        className="min-h-0 flex-1"
        viewportProps={{
          className: "overflow-x-hidden [&>div]:!block [&>div]:min-w-0",
        }}
      >
        <SidebarMenu className="pe-3">
          {conversations.map((conversation) => (
            <SidebarMenuItem key={conversation.id}>
              <ConversationSidebarItem
                conversation={conversation}
                isActive={conversation.id === activeConversationId}
                onSelect={() => onSelectConversation(conversation.id)}
              />
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </ScrollArea>
    </TooltipProvider>
  );
}
