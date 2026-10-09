import type { SessionRecord } from "@cocurdex/shared";
import { useAtomValue, useSetAtom } from "jotai";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Pencil,
  SquareSplitHorizontal,
  SquareSplitVertical,
  Trash2,
} from "lucide-react";
import { useCallback, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CocurdexMark } from "@/components/cocurdex-mark";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuSeparator,
  ContextMenuTrigger,
  SidebarListRow,
  Text,
} from "@/components/ui";
import { permissionsBySessionAtom } from "@/features/agent/permission";
import { questionsBySessionAtom } from "@/features/agent/question";
import {
  archiveSessionAtom,
  canMarkSessionUnread,
  collectSessionSubtreeIds,
  deleteSessionAtom,
  focusedPaneCanSplitDownAtom,
  focusedPaneCanSplitRightAtom,
  getAgentDisplayLabel,
  markSessionUnreadAtom,
  openSessionInSplitAtom,
  sessionResultAttentionAtom,
  sessionsAtom,
  unreadSessionIdsAtom,
  updateSessionTitleAtom,
} from "@/features/sessions";
import {
  getAgentRoles,
  subscribeAgentRoles,
  useAgentRoleSummary,
} from "@/features/sessions/agent-role";
import { openSettings } from "@/features/settings";
import { cn, desktopApi, logRendererDiagnostic } from "@/lib";
import { SidebarContextMenuItem } from "./sidebar-context-menu-item";
import { SidebarItemTooltip } from "./sidebar-item-preview";
import { SidebarOverflowTitle } from "./sidebar-overflow-title";
import { SidebarRenameInput } from "./sidebar-rename-input";
import { useCompactAgeLabel } from "./use-compact-age-label";

interface SessionSidebarItemProps {
  hasChildren?: boolean;
  isActive: boolean;
  isExpanded?: boolean;
  onSelect(): void;
  onToggleExpand?(): void;
  session: SessionRecord;
  showTimestamp?: boolean;
  workspaceName?: string;
}

function SessionStatusIndicator({
  needsAttention,
  isRunning,
}: {
  isRunning: boolean;
  needsAttention: boolean;
}) {
  const { t } = useTranslation("sessions");

  if (!(needsAttention || isRunning)) {
    return null;
  }

  return (
    <span className="flex size-4 shrink-0 items-center justify-center">
      {needsAttention ? (
        <span
          className="sidebar-activity-dot size-1.5 rounded-full text-chat-status-pending-fg"
          role="img"
          aria-label={t("sidebar.pendingAttention")}
        />
      ) : (
        <span aria-label={t("sidebar.running")} role="img">
          <CocurdexMark className="size-4" motion="working" />
        </span>
      )}
    </span>
  );
}

function SessionAgeLabel({ timestamp }: { timestamp: string }) {
  const label = useCompactAgeLabel(timestamp);
  return (
    <Text
      size="meta"
      className="shrink-0 text-sidebar-fg-subtle tabular-nums @max-[13rem]/sidebar:hidden"
    >
      {label}
    </Text>
  );
}

function SessionUnreadDot() {
  const { t } = useTranslation("sessions");

  return (
    <span
      className="size-1.5 shrink-0 rounded-full bg-sidebar-primary"
      role="img"
      aria-label={t("sidebar.unread")}
    />
  );
}

function SessionTrailing({
  isRunning,
  isUnread,
  needsAttention,
  showTimestamp,
  timestamp,
}: {
  isRunning: boolean;
  isUnread: boolean;
  needsAttention: boolean;
  showTimestamp: boolean;
  timestamp: string;
}) {
  if (needsAttention || isRunning) {
    return (
      <SessionStatusIndicator
        isRunning={isRunning}
        needsAttention={needsAttention}
      />
    );
  }
  if (isUnread) {
    return (
      <span className="flex shrink-0 items-center gap-1.5">
        <SessionUnreadDot />
        {showTimestamp ? <SessionAgeLabel timestamp={timestamp} /> : null}
      </span>
    );
  }
  return showTimestamp ? <SessionAgeLabel timestamp={timestamp} /> : null;
}

export function SessionSidebarItem({
  hasChildren = false,
  isActive,
  isExpanded = true,
  onSelect,
  onToggleExpand,
  session,
  showTimestamp = true,
  workspaceName,
}: SessionSidebarItemProps) {
  const { t } = useTranslation("sessions");
  const updateSessionTitle = useSetAtom(updateSessionTitleAtom);
  const archiveSession = useSetAtom(archiveSessionAtom);
  const deleteSession = useSetAtom(deleteSessionAtom);
  const openSessionInSplit = useSetAtom(openSessionInSplitAtom);
  const markSessionUnread = useSetAtom(markSessionUnreadAtom);
  const resultAttention = useAtomValue(sessionResultAttentionAtom)[session.id];
  const isUnread = useAtomValue(unreadSessionIdsAtom).has(session.id);
  const permissionsBySession = useAtomValue(permissionsBySessionAtom);
  const questionsBySession = useAtomValue(questionsBySessionAtom);
  const sessions = useAtomValue(sessionsAtom);
  const canSplitRight = useAtomValue(focusedPaneCanSplitRightAtom);
  const canSplitDown = useAtomValue(focusedPaneCanSplitDownAtom);
  const roles = useSyncExternalStore(subscribeAgentRoles, getAgentRoles);
  const formatRoleSummary = useAgentRoleSummary();
  const selectedRole = session.agentRoleId
    ? (roles.find((role) => role.id === session.agentRoleId) ?? null)
    : null;
  const roleSummary = selectedRole
    ? formatRoleSummary(selectedRole, { includeAgent: false })
    : null;
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
  const isChild = Boolean(session.parentSessionId);
  const activityAt = session.lastMessageAt ?? session.updatedAt;
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
        agentId={session.agentType}
        agentLabel={getAgentDisplayLabel(session.agentType)}
        role={selectedRole ?? undefined}
        roleSummary={roleSummary ?? undefined}
        timestamp={activityAt}
        title={session.title}
        workspaceName={workspaceName}
      >
        <ContextMenuTrigger asChild>
          <SidebarListRow
            isActive={isActive}
            className={cn(isChild ? "ps-11 text-sidebar-fg-muted" : "ps-6")}
            onClick={hasChildren ? undefined : onSelect}
            render={hasChildren ? undefined : <button type="button" />}
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
                <SessionTrailing
                  isRunning={isRunning}
                  isUnread={isUnread && !isActive}
                  needsAttention={needsAttention}
                  showTimestamp={showTimestamp}
                  timestamp={activityAt}
                />
              </button>
            ) : (
              <>
                <SidebarOverflowTitle>{session.title}</SidebarOverflowTitle>
                <SessionTrailing
                  isRunning={isRunning}
                  isUnread={isUnread && !isActive}
                  needsAttention={needsAttention}
                  showTimestamp={showTimestamp}
                  timestamp={activityAt}
                />
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
          disabled={!canSplitRight}
          icon={SquareSplitVertical}
          onClick={() =>
            openSessionInSplit({
              sessionId: session.id,
              direction: "right",
            })
          }
        >
          {t("sidebar.splitRight")}
        </SidebarContextMenuItem>
        <SidebarContextMenuItem
          disabled={!canSplitDown}
          icon={SquareSplitHorizontal}
          onClick={() =>
            openSessionInSplit({
              sessionId: session.id,
              direction: "down",
            })
          }
        >
          {t("sidebar.splitDown")}
        </SidebarContextMenuItem>
        {!isActive && canMarkSessionUnread(resultAttention) ? (
          <SidebarContextMenuItem
            icon={CircleDot}
            onClick={() => markSessionUnread(session.id)}
          >
            {t("sidebar.markUnread")}
          </SidebarContextMenuItem>
        ) : null}
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
