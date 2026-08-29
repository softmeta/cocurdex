import type { SessionRecord, WorkspaceRecord } from "@cocurdex/shared";
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
  onRevealWorkspace(rootPath: string): void;
  onSelectSession(workspaceId: string, sessionId: string): void;
  onSelectWorkspace(workspaceId: string): void;
  onToggleWorkspace(workspaceId: string): void;
}

// Project tree tab of the sidebar. Scrolls internally so a long list never
// scrolls the sidebar chrome (tab bar + new-session row) out of view.
export function ProjectsPanel({
  activeConversationId,
  activeWorkspaceId,
  collapsedWorkspaceIds,
  optimisticActiveSessionId,
  sessionsByWorkspace,
  workspaces,
  onCreateAgent,
  onRemoveWorkspace,
  onRevealWorkspace,
  onSelectSession,
  onSelectWorkspace,
  onToggleWorkspace,
}: ProjectsPanelProps) {
  return (
    <TooltipProvider closeDelay={80} delay={400}>
      <ScrollArea
        className="min-h-0 flex-1"
        viewportProps={{
          className: "overflow-x-hidden [&>div]:!block [&>div]:min-w-0",
        }}
      >
        {/* No extra start indent: workspace rows share the tab bar's left edge. */}
        <SidebarMenu className="pe-3">
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
        </SidebarMenu>
      </ScrollArea>
    </TooltipProvider>
  );
}
