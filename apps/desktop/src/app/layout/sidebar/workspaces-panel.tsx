import type { SessionRecord, WorkspaceRecord } from "@cocurdex/shared";
import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  restrictToFirstScrollableAncestor,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useSetAtom } from "jotai";
import { Folder } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppConfirmDialog } from "@/components/app";
import { SidebarMenu, TooltipProvider } from "@/components/ui";
import {
  EditWorkspaceDialog,
  updateWorkspaceAtom,
} from "@/features/workspaces";
import { SessionFilterEmpty } from "./session-filter-empty";
import { SidebarScrollArea } from "./sidebar-scroll-area";
import { useSidebarSectionCollapse } from "./use-sidebar-section-collapse";
import { WorkspaceSidebarItem } from "./workspace-sidebar-item";

interface WorkspacesPanelProps {
  activeWorkspaceId: string | null;
  collapsedWorkspaceIds: string[];
  filtered: boolean;
  leading?: ReactNode;
  optimisticActiveSessionId: string | null;
  sessionsByWorkspace: Record<string, SessionRecord[]>;
  workspaces: WorkspaceRecord[];
  onCreateAgent(workspaceId?: string): void;
  onRemoveWorkspace(workspaceId: string): void;
  onReorderWorkspaces(activeId: string, overId: string): void;
  onRevealWorkspace(rootPath: string): void;
  onSelectSession(workspaceId: string, sessionId: string): void;
  onToggleWorkspace(workspaceId: string): void;
}

export function WorkspacesPanel({
  activeWorkspaceId,
  collapsedWorkspaceIds,
  filtered,
  leading,
  optimisticActiveSessionId,
  sessionsByWorkspace,
  workspaces,
  onCreateAgent,
  onRemoveWorkspace,
  onReorderWorkspaces,
  onRevealWorkspace,
  onSelectSession,
  onToggleWorkspace,
}: WorkspacesPanelProps) {
  const { t } = useTranslation("sessions");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(
    null,
  );
  const updateWorkspace = useSetAtom(updateWorkspaceAtom);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const sessionsSection = useSidebarSectionCollapse("sessions");
  const listedWorkspaces = sessionsSection.collapsed ? [] : workspaces;
  const workspaceIds = useMemo(
    () => workspaces.map((workspace) => workspace.id),
    [workspaces],
  );
  const activeWorkspace = workspaces.find(
    (workspace) => workspace.id === activeId,
  );
  const [removingWorkspaceId, setRemovingWorkspaceId] = useState<string | null>(
    null,
  );
  const removingWorkspace = workspaces.find(
    (workspace) => workspace.id === removingWorkspaceId,
  );
  const editingWorkspace = workspaces.find(
    (workspace) => workspace.id === editingWorkspaceId,
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const overId = event.over?.id;
    if (overId == null) {
      return;
    }
    const activeDragId = String(event.active.id);
    const overDragId = String(overId);
    if (activeDragId === overDragId) {
      return;
    }
    onReorderWorkspaces(activeDragId, overDragId);
  };

  return (
    <TooltipProvider closeDelay={80}>
      <DndContext
        onDragCancel={() => setActiveId(null)}
        onDragEnd={handleDragEnd}
        onDragStart={handleDragStart}
        sensors={sensors}
      >
        <SidebarScrollArea
          className="min-h-0 flex-1"
          viewportProps={{
            className: "overflow-x-hidden [&>div]:!block [&>div]:min-w-0",
          }}
        >
          <SidebarMenu className="pe-3">
            {leading}
            {filtered &&
            !sessionsSection.collapsed &&
            workspaces.length === 0 ? (
              <SessionFilterEmpty className="px-1 py-1 text-meta text-sidebar-fg-subtle" />
            ) : null}
            <SortableContext
              items={workspaceIds}
              strategy={verticalListSortingStrategy}
            >
              {listedWorkspaces.map((workspace) => (
                <WorkspaceSidebarItem
                  activeWorkspaceId={activeWorkspaceId}
                  expanded={!collapsedWorkspaceIds.includes(workspace.id)}
                  filtered={filtered}
                  key={workspace.id}
                  onCreateAgent={onCreateAgent}
                  onEditWorkspace={setEditingWorkspaceId}
                  onRemoveWorkspace={setRemovingWorkspaceId}
                  onRevealWorkspace={onRevealWorkspace}
                  onSelectSession={onSelectSession}
                  onToggleWorkspace={onToggleWorkspace}
                  optimisticActiveSessionId={optimisticActiveSessionId}
                  sessions={sessionsByWorkspace[workspace.id] ?? []}
                  workspace={workspace}
                />
              ))}
            </SortableContext>
          </SidebarMenu>
        </SidebarScrollArea>
        <DragOverlay
          modifiers={[
            restrictToVerticalAxis,
            restrictToFirstScrollableAncestor,
          ]}
        >
          {activeWorkspace ? (
            <div
              data-testid="workspace-drag-overlay"
              className="flex h-7 max-w-56 items-center gap-1.5 rounded-control bg-sidebar px-1 text-body text-sidebar-fg shadow-sm"
            >
              <Folder className="size-3.5 shrink-0 text-sidebar-fg-subtle" />
              <span className="min-w-0 truncate">{activeWorkspace.name}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      {editingWorkspace ? (
        <EditWorkspaceDialog
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              setEditingWorkspaceId(null);
            }
          }}
          onRemoveWorkspace={(workspaceId) => {
            setEditingWorkspaceId(null);
            onRemoveWorkspace(workspaceId);
          }}
          onSave={async (workspaceId, update) => {
            await updateWorkspace(workspaceId, update);
            setEditingWorkspaceId(null);
          }}
          open={editingWorkspace !== undefined}
          workspace={editingWorkspace}
        />
      ) : null}
      <AppConfirmDialog
        cancelLabel={t("workspace.editCancel")}
        confirmLabel={t("workspace.editRemoveWorkspace")}
        description={t("workspace.editRemoveDescription", {
          name: removingWorkspace?.name ?? "",
        })}
        onConfirm={() => {
          if (removingWorkspaceId) onRemoveWorkspace(removingWorkspaceId);
        }}
        onOpenChange={(open) => {
          if (!open) setRemovingWorkspaceId(null);
        }}
        open={removingWorkspace !== undefined}
        title={t("workspace.editRemoveTitle", {
          name: removingWorkspace?.name ?? "",
        })}
        variant="destructive"
      />
    </TooltipProvider>
  );
}
