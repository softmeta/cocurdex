import type { SessionRecord } from "@cocurdex/shared";
import { useAtomValue, useSetAtom } from "jotai";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
} from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
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
  collectSessionSubtreeIds,
  deleteSessionAtom,
  isSubagentSession,
  sessionsAtom,
  updateSessionTitleAtom,
} from "@/features/sessions";
import { openSettings } from "@/features/settings";
import { cn, desktopApi, logRendererDiagnostic } from "@/lib";
import { SidebarContextMenuItem } from "./sidebar-context-menu-item";
import { SidebarItemTooltip } from "./sidebar-item-preview";
import { SidebarOverflowTitle } from "./sidebar-overflow-title";
import { SidebarRenameInput } from "./sidebar-rename-input";

interface SessionSidebarItemProps {
  depth?: number;
  hasChildren?: boolean;
  isActive: boolean;
  isExpanded?: boolean;
  onSelect(): void;
  onToggleExpand?(): void;
  session: SessionRecord;
}

export function SessionSidebarItem({
  depth = 0,
  hasChildren = false,
  isActive,
  isExpanded = true,
  onSelect,
  onToggleExpand,
  session,
}: SessionSidebarItemProps) {
  const { t } = useTranslation("sessions");
  const updateSessionTitle = useSetAtom(updateSessionTitleAtom);
  const archiveSession = useSetAtom(archiveSessionAtom);
  const deleteSession = useSetAtom(deleteSessionAtom);
  const permissionsBySession = useAtomValue(permissionsBySessionAtom);
  const questionsBySession = useAtomValue(questionsBySessionAtom);
  const sessions = useAtomValue(sessionsAtom);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [draftTitle, setDraftTitle] = useState(session.title);
  const descendantIds =
    hasChildren && !isExpanded
      ? collectSessionSubtreeIds(sessions, session.id)
      : null;
  const isRunning =
    session.status === "running" ||
    [...(descendantIds ?? [])].some(
      (sessionId) =>
        sessionId !== session.id &&
        sessions.find((item) => item.id === sessionId)?.status === "running",
    );
  const needsAttention = [...(descendantIds ?? [session.id])].some(
    (sessionId) =>
      permissionsBySession[sessionId]?.some(
        (permission) => permission.status === "pending",
      ) ||
      questionsBySession[sessionId]?.some(
        (question) => question.status === "pending",
      ),
  );
  const isChild = isSubagentSession(session);
  const startPaddingPx = 24 + depth * 12 - (hasChildren ? 20 : 0);
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

  const handleArchive = async () => {
    if (isArchiving) {
      return;
    }
    setIsArchiving(true);
    const archivedAt = new Date().toISOString();
    try {
      const archived = await desktopApi.archiveSession({
        sessionId: session.id,
        archivedAt,
      });
      if (!archived) {
        throw new Error("Session not found");
      }
      archiveSession({ sessionId: session.id, archivedAt });
      toast.success(t("archive.success"), {
        action: {
          label: t("archive.view"),
          onClick: () => openSettings("archived"),
        },
      });
    } catch (error) {
      toast.error(t("archive.failed"));
      logRendererDiagnostic("debug", "[SessionArchive] archive failed", {
        sessionId: session.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsArchiving(false);
    }
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
              depth === 0 && (hasChildren ? "ps-1" : "ps-6"),
              isChild && "text-sidebar-fg-muted",
            )}
            onClick={hasChildren ? undefined : onSelect}
            render={hasChildren ? undefined : <button type="button" />}
            style={
              depth > 0
                ? { paddingInlineStart: `${startPaddingPx}px` }
                : undefined
            }
          >
            {hasChildren ? (
              <button
                type="button"
                className="flex size-3.5 shrink-0 items-center justify-center text-sidebar-fg-muted hover:text-sidebar-fg"
                aria-expanded={isExpanded}
                aria-label={
                  isExpanded
                    ? t("sidebar.collapseChildren")
                    : t("sidebar.expandChildren")
                }
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleExpand?.();
                }}
              >
                {isExpanded ? (
                  <ChevronDown className="size-3.5" />
                ) : (
                  <ChevronRight className="size-3.5 rtl:-scale-x-100" />
                )}
              </button>
            ) : null}
            {hasChildren ? (
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 text-start"
                onClick={onSelect}
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
              </button>
            ) : (
              <>
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
              </>
            )}
          </SidebarListRow>
        </ContextMenuTrigger>
      </SidebarItemTooltip>
      <ContextMenuContent className="min-w-26">
        <SidebarContextMenuItem icon={Pencil} onClick={startRename}>
          {t("sidebar.rename")}
        </SidebarContextMenuItem>
        <SidebarContextMenuItem
          icon={Archive}
          onClick={handleArchive}
          disabled={isArchiving}
        >
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
