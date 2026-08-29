import type { ConversationRecord } from "@cocurdex/shared";
import { useSetAtom } from "jotai";
import { Archive, Pencil, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuSeparator,
  ContextMenuTrigger,
  SidebarListRow,
} from "@/components/ui";
import {
  removeConversationAtom,
  upsertConversationAtom,
} from "@/features/chat";
import { desktopApi, logRendererDiagnostic } from "@/lib";
import { SidebarContextMenuItem } from "./sidebar-context-menu-item";
import { SidebarItemTooltip } from "./sidebar-item-preview";
import { SidebarOverflowTitle } from "./sidebar-overflow-title";
import { SidebarRenameInput } from "./sidebar-rename-input";

interface ConversationSidebarItemProps {
  conversation: ConversationRecord;
  isActive: boolean;
  onSelect(): void;
}

export function ConversationSidebarItem({
  conversation,
  isActive,
  onSelect,
}: ConversationSidebarItemProps) {
  const { t } = useTranslation("chat");
  const removeConversation = useSetAtom(removeConversationAtom);
  const upsertConversation = useSetAtom(upsertConversationAtom);
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(conversation.title);
  const renameInputRef = useCallback((node: HTMLInputElement | null) => {
    node?.focus();
    node?.select();
  }, []);

  const startRename = () => {
    setDraftTitle(conversation.title);
    setIsRenaming(true);
  };

  const cancelRename = () => {
    setDraftTitle(conversation.title);
    setIsRenaming(false);
  };

  const commitRename = () => {
    const title = draftTitle.trim();

    if (!title || title === conversation.title) {
      cancelRename();
      return;
    }

    const updatedConversation = {
      ...conversation,
      title,
      updatedAt: new Date().toISOString(),
    };
    upsertConversation({ conversation: updatedConversation });
    setIsRenaming(false);

    void desktopApi
      .chatUpdate({
        conversationId: conversation.id,
        title,
      })
      .catch((error) => {
        logRendererDiagnostic(
          "debug",
          "[ConversationTitle] manual rename failed",
          {
            conversationId: conversation.id,
            error: error instanceof Error ? error.message : "Unknown error",
          },
        );
      });
  };

  const handleArchive = () => {
    removeConversation(conversation.id);

    void desktopApi.chatArchive(conversation.id).catch((error) => {
      logRendererDiagnostic("debug", "[ConversationArchive] archive failed", {
        conversationId: conversation.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    });
  };

  const handleDelete = () => {
    removeConversation(conversation.id);

    void desktopApi.chatDelete(conversation.id).catch((error) => {
      logRendererDiagnostic("debug", "[ConversationDelete] delete failed", {
        conversationId: conversation.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    });
  };

  if (isRenaming) {
    return (
      <SidebarRenameInput
        aria-label={t("list.renameConversation", {
          title: conversation.title,
        })}
        onBlur={commitRename}
        onChange={(event) => setDraftTitle(event.target.value)}
        onFocus={(event) => event.target.select()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }

          if (event.key === "Escape") {
            event.preventDefault();
            cancelRename();
          }
        }}
        ref={renameInputRef}
        value={draftTitle}
      />
    );
  }

  return (
    <ContextMenu>
      <SidebarItemTooltip
        timestamp={conversation.lastMessageAt ?? conversation.updatedAt}
        title={conversation.title}
      >
        <ContextMenuTrigger asChild>
          <SidebarListRow
            isActive={isActive}
            // px-1 matches SidebarGroupLabel so titles share the section edge.
            className="px-1"
            onClick={onSelect}
            render={<button type="button" />}
          >
            <SidebarOverflowTitle>{conversation.title}</SidebarOverflowTitle>
          </SidebarListRow>
        </ContextMenuTrigger>
      </SidebarItemTooltip>
      <ContextMenuContent className="min-w-26">
        <SidebarContextMenuItem icon={Pencil} onClick={startRename}>
          {t("list.rename")}
        </SidebarContextMenuItem>
        <SidebarContextMenuItem icon={Archive} onClick={handleArchive}>
          {t("list.archive")}
        </SidebarContextMenuItem>
        <ContextMenuSeparator />
        <SidebarContextMenuItem
          destructive
          icon={Trash2}
          onClick={handleDelete}
        >
          {t("list.delete")}
        </SidebarContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
