import type { SessionRecord, WorkspaceRecord } from "@cocurdex/shared";
import { primaryWorkspaceRootPath } from "@cocurdex/shared";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAtomValue } from "jotai";
import {
  Folder,
  FolderOpen,
  Folders,
  Pencil,
  SquarePen,
  Trash2,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuSeparator,
  ContextMenuTrigger,
  SidebarListRow,
  SidebarListRowActions,
  SidebarMenuItem,
} from "@/components/ui";
import { cn, desktopApi } from "@/lib";
import { FoldersOpen } from "./folders-open-icon";
import { pendingRequestSessionIdsAtom } from "./pending-request-store";
import { SidebarContextMenuItem } from "./sidebar-context-menu-item";
import { WorkspaceItemTooltip } from "./sidebar-item-preview";
import { SidebarSessionTree } from "./sidebar-session-tree";

interface WorkspaceSidebarItemProps {
  activeWorkspaceId: string | null;
  expanded: boolean;
  filtered: boolean;
  optimisticActiveSessionId: string | null;
  sessions: SessionRecord[];
  workspace: WorkspaceRecord;
  onCreateAgent(workspaceId: string): void;
  onEditWorkspace(workspaceId: string): void;
  onRemoveWorkspace(workspaceId: string): void;
  onRevealWorkspace(rootPath: string): void;
  onSelectSession(workspaceId: string, sessionId: string): void;
  onToggleWorkspace(workspaceId: string): void;
  onSelectWorkspace(workspaceId: string): void;
}

export function WorkspaceSidebarItem({
  activeWorkspaceId,
  expanded,
  filtered,
  optimisticActiveSessionId,
  sessions,
  workspace,
  onCreateAgent,
  onEditWorkspace,
  onRemoveWorkspace,
  onRevealWorkspace,
  onSelectSession,
  onToggleWorkspace,
  onSelectWorkspace,
}: WorkspaceSidebarItemProps) {
  const { t } = useTranslation("sessions");
  const pendingRequestSessionIds = useAtomValue(pendingRequestSessionIdsAtom);
  const isRunning =
    !expanded && sessions.some((session) => session.status === "running");
  const needsAttention =
    !expanded &&
    sessions.some((session) => pendingRequestSessionIds.has(session.id));
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: workspace.id });
  const WorkspaceIcon = workspaceIconFor(workspace, expanded);
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
        <WorkspaceItemTooltip workspace={workspace}>
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
                <WorkspaceIcon className="size-3.5 shrink-0 text-sidebar-fg-subtle" />
                <span className="min-w-0 flex-1 truncate">
                  {workspace.name}
                </span>
              </button>
              <div className="relative flex size-5 shrink-0 items-center justify-center">
                {isRunning || needsAttention ? (
                  <span
                    className={cn(
                      "sidebar-activity-dot sidebar-activity-dot--hover-handoff size-1.5 rounded-full",
                      needsAttention
                        ? "text-chat-status-pending-fg"
                        : "text-sidebar-thinking-dot",
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
        </WorkspaceItemTooltip>
        <ContextMenuContent className="min-w-44">
          {desktopApi.capabilities.fileManager ? (
            <SidebarContextMenuItem
              icon={FolderOpen}
              onClick={() =>
                onRevealWorkspace(primaryWorkspaceRootPath(workspace))
              }
            >
              {t("sidebar.revealInFileManager", {
                defaultValue: "Reveal in file manager",
              })}
            </SidebarContextMenuItem>
          ) : null}
          <SidebarContextMenuItem
            icon={Pencil}
            onClick={() => onEditWorkspace(workspace.id)}
          >
            {t("sidebar.editWorkspace", { defaultValue: "Edit workspace" })}
          </SidebarContextMenuItem>
          <ContextMenuSeparator />
          <SidebarContextMenuItem
            destructive
            icon={Trash2}
            onClick={() => onRemoveWorkspace(workspace.id)}
          >
            {t("sidebar.removeWorkspace", { defaultValue: "Remove workspace" })}
          </SidebarContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {expanded ? (
        <SidebarSessionTree
          emptyLabel={
            filtered ? t("sidebar.view.noMatches") : t("sidebar.noAgentsYet")
          }
          listKey={workspace.id}
          onSelectSession={onSelectSession}
          optimisticActiveSessionId={optimisticActiveSessionId}
          sessions={sessions}
        />
      ) : null}
    </SidebarMenuItem>
  );
}

function workspaceIconFor(workspace: WorkspaceRecord, expanded: boolean) {
  if (workspace.rootPaths.length > 1) {
    return expanded ? FoldersOpen : Folders;
  }
  return expanded ? FolderOpen : Folder;
}
