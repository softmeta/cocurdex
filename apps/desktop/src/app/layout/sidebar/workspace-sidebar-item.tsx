import type { SessionRecord, WorkspaceRecord } from "@cocurdex/shared";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAtomValue, useSetAtom } from "jotai";
import { Folder, FolderOpen, SquarePen, Trash2 } from "lucide-react";
import { type CSSProperties, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuSeparator,
  ContextMenuTrigger,
  SidebarListRow,
  SidebarListRowActions,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
} from "@/components/ui";
import { permissionsBySessionAtom } from "@/features/agent/permission";
import { questionsBySessionAtom } from "@/features/agent/question";
import {
  buildVisibleSessionTree,
  collapsedSessionIdsAtom,
  toggleSessionCollapsedAtom,
} from "@/features/sessions";
import { cn } from "@/lib";
import { SessionSidebarItem } from "./session-sidebar-item";
import { SidebarContextMenuItem } from "./sidebar-context-menu-item";

interface WorkspaceSidebarItemProps {
  activeConversationId: string | null;
  activeWorkspaceId: string | null;
  expanded: boolean;
  optimisticActiveSessionId: string | null;
  sessions: SessionRecord[];
  workspace: WorkspaceRecord;
  onCreateAgent(workspaceId: string): void;
  onRemoveWorkspace(workspaceId: string): void;
  onRevealWorkspace(rootPath: string): void;
  onSelectSession(workspaceId: string, sessionId: string): void;
  onToggleWorkspace(workspaceId: string): void;
  onSelectWorkspace(workspaceId: string): void;
}

export function WorkspaceSidebarItem({
  activeConversationId,
  activeWorkspaceId,
  expanded,
  optimisticActiveSessionId,
  sessions,
  workspace,
  onCreateAgent,
  onRemoveWorkspace,
  onRevealWorkspace,
  onSelectSession,
  onToggleWorkspace,
  onSelectWorkspace,
}: WorkspaceSidebarItemProps) {
  const { t } = useTranslation("sessions");
  const collapsedSessionIds = useAtomValue(collapsedSessionIdsAtom);
  const toggleSessionCollapsed = useSetAtom(toggleSessionCollapsedAtom);
  const permissionsBySession = useAtomValue(permissionsBySessionAtom);
  const questionsBySession = useAtomValue(questionsBySessionAtom);
  const sessionTree = useMemo(
    () => buildVisibleSessionTree(sessions, collapsedSessionIds),
    [sessions, collapsedSessionIds],
  );
  const isRunning =
    !expanded && sessions.some((session) => session.status === "running");
  const needsAttention =
    !expanded &&
    sessions.some(
      (session) =>
        permissionsBySession[session.id]?.some(
          (permission) => permission.status === "pending",
        ) ||
        questionsBySession[session.id]?.some(
          (question) => question.status === "pending",
        ),
    );
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: workspace.id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <SidebarMenuItem
      className={cn("flex flex-col gap-0.5", isDragging && "opacity-40")}
      ref={setNodeRef}
      style={style}
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <SidebarListRow
            isActive={activeWorkspaceId === workspace.id}
            variant="subtle"
            className="px-1"
            {...attributes}
            {...listeners}
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 cursor-default items-center gap-1.5 text-start active:cursor-grabbing"
              onClick={() => {
                onSelectWorkspace(workspace.id);
                onToggleWorkspace(workspace.id);
              }}
            >
              {expanded ? (
                <FolderOpen className="size-3.5 shrink-0 text-sidebar-fg-subtle" />
              ) : (
                <Folder className="size-3.5 shrink-0 text-sidebar-fg-subtle" />
              )}
              <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
            </button>
            <div className="relative flex size-5 shrink-0 items-center justify-center">
              {isRunning || needsAttention ? (
                <span
                  className={cn(
                    "sidebar-activity-dot size-1.5 rounded-full",
                    needsAttention
                      ? "bg-chat-status-pending-fg"
                      : "bg-sidebar-thinking-dot",
                  )}
                  role="img"
                  aria-label={
                    needsAttention
                      ? t("sidebar.pendingAttention")
                      : t("sidebar.running")
                  }
                />
              ) : null}
              <SidebarListRowActions
                className="pointer-events-none absolute inset-0 flex items-center justify-center group-hover/list-row:pointer-events-auto focus-within:pointer-events-auto"
                visibility="hover"
              >
                <button
                  type="button"
                  aria-label={t("sidebar.newSessionInWorkspace", {
                    workspaceName: workspace.name,
                  })}
                  className="flex size-5 items-center justify-center text-sidebar-fg-muted transition-colors hover:text-sidebar-fg"
                  onClick={() => onCreateAgent(workspace.id)}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <SquarePen className="size-3.5" />
                </button>
              </SidebarListRowActions>
            </div>
          </SidebarListRow>
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-44">
          <SidebarContextMenuItem
            icon={FolderOpen}
            onClick={() => onRevealWorkspace(workspace.rootPath)}
          >
            {t("sidebar.revealInFileManager", {
              defaultValue: "Reveal in file manager",
            })}
          </SidebarContextMenuItem>
          <ContextMenuSeparator />
          <SidebarContextMenuItem
            destructive
            icon={Trash2}
            onClick={() => onRemoveWorkspace(workspace.id)}
          >
            {t("sidebar.removeProject", { defaultValue: "Remove project" })}
          </SidebarContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {expanded ? (
        // No sub-tree gutter: session titles align with the workspace name
        // (workspace row is ps-1 + size-3.5 icon + gap-1.5 → session ps-6).
        <SidebarMenuSub className="ms-0 ps-0">
          {sessions.length === 0 ? (
            <div className="ps-6 pe-2 py-1 text-xs text-sidebar-fg-subtle">
              {t("sidebar.noAgentsYet")}
            </div>
          ) : (
            sessionTree.map((node) => (
              <SidebarMenuSubItem key={node.session.id}>
                <SessionSidebarItem
                  depth={node.depth}
                  hasChildren={node.hasChildren}
                  isActive={
                    activeConversationId === null &&
                    node.session.id === optimisticActiveSessionId
                  }
                  isExpanded={!collapsedSessionIds.has(node.session.id)}
                  onSelect={() =>
                    onSelectSession(workspace.id, node.session.id)
                  }
                  onToggleExpand={() => toggleSessionCollapsed(node.session.id)}
                  session={node.session}
                />
              </SidebarMenuSubItem>
            ))
          )}
        </SidebarMenuSub>
      ) : null}
    </SidebarMenuItem>
  );
}
