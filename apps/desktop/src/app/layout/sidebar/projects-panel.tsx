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
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Folder } from "lucide-react";
import { useMemo, useState } from "react";
import { ScrollArea, SidebarMenu, TooltipProvider } from "@/components/ui";
import { WorkspaceSidebarItem } from "./workspace-sidebar-item";

interface ProjectsPanelProps {
  activeConversationId: string | null;
  activeWorkspaceId: string | null;
  collapsedWorkspaceIds: string[];
  optimisticActiveSessionId: string | null;
  sessionsByWorkspace: Record<string, SessionRecord[]>;
  workspaces: WorkspaceRecord[];
  onCreateAgent(workspaceId?: string): void;
  onRemoveWorkspace(workspaceId: string): void;
  onReorderWorkspaces(activeId: string, overId: string): void;
  onRevealWorkspace(rootPath: string): void;
  onSelectSession(workspaceId: string, sessionId: string): void;
  onSelectWorkspace(workspaceId: string): void;
  onToggleWorkspace(workspaceId: string): void;
}

export function ProjectsPanel({
  activeConversationId,
  activeWorkspaceId,
  collapsedWorkspaceIds,
  optimisticActiveSessionId,
  sessionsByWorkspace,
  workspaces,
  onCreateAgent,
  onRemoveWorkspace,
  onReorderWorkspaces,
  onRevealWorkspace,
  onSelectSession,
  onSelectWorkspace,
  onToggleWorkspace,
}: ProjectsPanelProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const workspaceIds = useMemo(
    () => workspaces.map((workspace) => workspace.id),
    [workspaces],
  );
  const activeWorkspace = workspaces.find(
    (workspace) => workspace.id === activeId,
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
    <TooltipProvider closeDelay={80} delay={400}>
      <DndContext
        onDragCancel={() => setActiveId(null)}
        onDragEnd={handleDragEnd}
        onDragStart={handleDragStart}
        sensors={sensors}
      >
        <ScrollArea
          className="min-h-0 flex-1"
          viewportProps={{
            className: "overflow-x-hidden [&>div]:!block [&>div]:min-w-0",
          }}
        >
          <SidebarMenu className="pe-3">
            <SortableContext
              items={workspaceIds}
              strategy={verticalListSortingStrategy}
            >
              {workspaces.map((workspace) => (
                <WorkspaceSidebarItem
                  activeConversationId={activeConversationId}
                  activeWorkspaceId={activeWorkspaceId}
                  expanded={!collapsedWorkspaceIds.includes(workspace.id)}
                  key={workspace.id}
                  onCreateAgent={onCreateAgent}
                  onRemoveWorkspace={onRemoveWorkspace}
                  onRevealWorkspace={onRevealWorkspace}
                  onSelectSession={onSelectSession}
                  onSelectWorkspace={onSelectWorkspace}
                  onToggleWorkspace={onToggleWorkspace}
                  optimisticActiveSessionId={optimisticActiveSessionId}
                  sessions={sessionsByWorkspace[workspace.id] ?? []}
                  workspace={workspace}
                />
              ))}
            </SortableContext>
          </SidebarMenu>
        </ScrollArea>
        <DragOverlay>
          {activeWorkspace ? (
            <div className="flex h-7 max-w-56 items-center gap-1.5 rounded-control bg-sidebar px-1 text-body text-sidebar-fg shadow-sm">
              <Folder className="size-3.5 shrink-0 text-sidebar-fg-subtle" />
              <span className="min-w-0 truncate">{activeWorkspace.name}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </TooltipProvider>
  );
}
