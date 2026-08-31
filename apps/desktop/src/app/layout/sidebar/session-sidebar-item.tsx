import type { SessionRecord } from "@cocurdex/shared";
import { useAtomValue, useSetAtom } from "jotai";
import { Archive, Pencil, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuSeparator,
  ContextMenuTrigger,
  SidebarListRow,
  Spinner,
} from "@/components/ui";
import { permissionsBySessionAtom } from "@/features/agent/permission";
import { questionsBySessionAtom } from "@/features/agent/question";
import {
  agentLabels,
  archiveSessionAtom,
  deleteSessionAtom,
  isSubagentSession,
  updateSessionTitleAtom,
} from "@/features/sessions";
import { cn, desktopApi, logRendererDiagnostic } from "@/lib";
import { SidebarContextMenuItem } from "./sidebar-context-menu-item";
import { SidebarItemTooltip } from "./sidebar-item-preview";
import { SidebarOverflowTitle } from "./sidebar-overflow-title";
import { SidebarRenameInput } from "./sidebar-rename-input";

interface SessionSidebarItemProps {
  depth?: number;
  isActive: boolean;
  onSelect(): void;
  session: SessionRecord;
}

export function SessionSidebarItem({
  depth = 0,
  isActive,
  onSelect,
  session,
}: SessionSidebarItemProps) {
  const { t } = useTranslation("sessions");
  const updateSessionTitle = useSetAtom(updateSessionTitleAtom);
  const archiveSession = useSetAtom(archiveSessionAtom);
  const deleteSession = useSetAtom(deleteSessionAtom);
  const permissions = useAtomValue(permissionsBySessionAtom)[session.id];
  const questions = useAtomValue(questionsBySessionAtom)[session.id];
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(session.title);
  const isRunning = session.status === "running";
  const needsAttention =
    permissions?.some((permission) => permission.status === "pending") ||
    questions?.some((question) => question.status === "pending");
  const isChild = isSubagentSession(session);
  const renameInputRef = useCallback((node: HTMLInputElement | null) => {
    node?.focus();
    node?.select();
  }, []);

  const startRename = () => {
    setDraftTitle(session.title);
    setIsRenaming(true);
  };

  const cancelRename = () => {
    setDraftTitle(session.title);
    setIsRenaming(false);
  };

  const commitRename = () => {
    const title = draftTitle.trim();

    if (!title || title === session.title) {
      cancelRename();
      return;
    }

    const updatedAt = new Date().toISOString();
    updateSessionTitle({
      sessionId: session.id,
      title,
      updatedAt,
    });
    setIsRenaming(false);

    void desktopApi
      .updateSessionTitle({
        sessionId: session.id,
        title,
        updatedAt,
      })
      .catch((error) => {
        logRendererDiagnostic("debug", "[SessionTitle] manual rename failed", {
          sessionId: session.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      });
  };

  const handleArchive = () => {
    const archivedAt = new Date().toISOString();
    archiveSession({ sessionId: session.id, archivedAt });

    void desktopApi
      .archiveSession({ sessionId: session.id, archivedAt })
      .catch((error) => {
        logRendererDiagnostic("debug", "[SessionArchive] archive failed", {
          sessionId: session.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      });
  };

  const handleDelete = () => {
    deleteSession({ sessionId: session.id });

    void desktopApi.deleteSession({ sessionId: session.id }).catch((error) => {
      logRendererDiagnostic("debug", "[SessionDelete] delete failed", {
        sessionId: session.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    });
  };

  if (isRenaming) {
    return (
      <SidebarRenameInput
        aria-label={t("sidebar.renameSession", { title: session.title })}
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
        agentLabel={agentLabels[session.agentType]}
        timestamp={session.lastMessageAt ?? session.updatedAt}
        title={session.title}
      >
        <ContextMenuTrigger asChild>
          <SidebarListRow
            isActive={isActive}
            className={cn(
              depth === 0 && "ps-6",
              isChild && "text-sidebar-fg-muted",
            )}
            onClick={onSelect}
            render={<button type="button" />}
            style={
              depth > 0
                ? { paddingInlineStart: `${24 + depth * 12}px` }
                : undefined
            }
          >
            <SidebarOverflowTitle>{session.title}</SidebarOverflowTitle>
            {needsAttention ? (
              <span
                className="size-1.5 shrink-0 rounded-full bg-chat-status-pending-fg"
                role="img"
                aria-label={t("sidebar.pendingAttention")}
              />
            ) : null}
            {isRunning ? (
              <Spinner
                aria-label={t("sidebar.running")}
                className="shrink-0 text-sidebar-thinking-fg"
                size="xs"
              />
            ) : null}
          </SidebarListRow>
        </ContextMenuTrigger>
      </SidebarItemTooltip>
      <ContextMenuContent className="min-w-26">
        <SidebarContextMenuItem icon={Pencil} onClick={startRename}>
          {t("sidebar.rename")}
        </SidebarContextMenuItem>
        <SidebarContextMenuItem icon={Archive} onClick={handleArchive}>
          {t("sidebar.archive")}
        </SidebarContextMenuItem>
        <ContextMenuSeparator />
        <SidebarContextMenuItem
          destructive
          icon={Trash2}
          onClick={handleDelete}
        >
          {t("sidebar.delete")}
        </SidebarContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
