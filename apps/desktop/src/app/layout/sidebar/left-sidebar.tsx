import type { InboxItem } from "@cocurdex/shared";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { FolderPlus, SquarePen } from "lucide-react";
import { type ReactNode, startTransition, useOptimistic } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AppSidebarIconButton } from "@/components/app";
import { chatSessionsAtom } from "@/features/chat";
import { inboxApi } from "@/features/inbox";
import {
  activeSessionIdAtom,
  removeSessionsByWorkspaceAtom,
  selectSessionAtom,
  sessionsAtom,
} from "@/features/sessions";
import {
  activeWorkspaceIdAtom,
  collapsedWorkspaceIdsAtom,
  removeWorkspaceAtom,
  reorderWorkspacesAtom,
  selectWorkspaceAtom,
  workspacesAtom,
} from "@/features/workspaces";
import {
  cn,
  desktopApi,
  logRendererDiagnostic,
  markSessionSwitch,
  startSessionSwitchLongTaskObserver,
} from "@/lib";
import { ArchiveGroupDialog } from "./archive-group-dialog";
import { BriefControl } from "./brief-control";
import { ChatSessionsPanel } from "./chat-sessions-panel";
import { PersonalAgentsPanel } from "./personal-agents-panel";
import { SessionGroupsPanel } from "./session-groups-panel";
import { SessionListSections } from "./session-list-sections";
import { SessionListViewMenu } from "./session-list-view-menu";
import { SidebarFooter } from "./sidebar-footer";
import { SidebarFormSwitcher } from "./sidebar-form-switcher";
import { sidebarTabAtom, switchSidebarTabAtom } from "./sidebar-tab-store";
import { useSidebarCreateActions } from "./use-sidebar-create-actions";
import { useSidebarSessionView } from "./use-sidebar-session-view";
import { WorkspacesPanel } from "./workspaces-panel";

interface LeftSidebarProps {
  // Dock reuse: drop the titlebar spacer (the dock has its own header) and
  // fire onAfterNavigate so the dock drawer can auto-close once a target is
  // picked. headerStart slots chrome (e.g. session-list toggle) into the same
  // bg-sidebar column so the dock drawer matches the main sidebar paint path.
  headerStart?: ReactNode;
  hideTitlebarSpacer?: boolean;
  onAfterNavigate?(): void;
  showFooter?: boolean;
}

function SidebarShell({ children }: { children?: ReactNode }) {
  return (
    <aside className="sidebar-scrollbar @container/sidebar flex h-full min-w-0 flex-col bg-sidebar">
      {children}
    </aside>
  );
}

function SidebarTopSlot({
  headerStart,
  hideTitlebarSpacer,
}: Pick<LeftSidebarProps, "headerStart" | "hideTitlebarSpacer">) {
  if (headerStart) {
    return <div className="shrink-0 ps-2">{headerStart}</div>;
  }
  if (hideTitlebarSpacer) {
    return null;
  }
  return <div className="shrink-0 h-9" />;
}

export function LeftSidebar({
  headerStart,
  hideTitlebarSpacer,
  onAfterNavigate,
  showFooter = false,
}: LeftSidebarProps) {
  const { t } = useTranslation(["sessions", "chat", "personal"]);
  const workspaces = useAtomValue(workspacesAtom);
  const sessions = useAtomValue(sessionsAtom);
  const activeWorkspaceId = useAtomValue(activeWorkspaceIdAtom);
  const activeSessionId = useAtomValue(activeSessionIdAtom);
  const selectWorkspace = useSetAtom(selectWorkspaceAtom);
  const removeWorkspace = useSetAtom(removeWorkspaceAtom);
  const reorderWorkspaces = useSetAtom(reorderWorkspacesAtom);
  const removeSessionsByWorkspace = useSetAtom(removeSessionsByWorkspaceAtom);
  const selectSession = useSetAtom(selectSessionAtom);
  const chatSessions = useAtomValue(chatSessionsAtom);
  const [optimisticActiveSessionId, setOptimisticActiveSessionId] =
    useOptimistic(activeSessionId);
  const [collapsedWorkspaceIds, setCollapsedWorkspaceIds] = useAtom(
    collapsedWorkspaceIdsAtom,
  );
  // Workspaces and chat are alternate views of the same rail, not two stacked
  // lists: only one list competes for the sidebar height at a time. The center
  // panel reads the same atom so its empty state matches the visible tab.
  const activeTab = useAtomValue(sidebarTabAtom);
  const switchSidebarTab = useSetAtom(switchSidebarTabAtom);

  const sessionView = useSidebarSessionView(workspaces, sessions);

  const { create, createSession, openWorkspace } = useSidebarCreateActions({
    beforeSelect: () => setOptimisticActiveSessionId(null),
    onAfterNavigate,
  });

  const selectFormSession = (sessionId: string) => {
    startTransition(() => {
      setOptimisticActiveSessionId(sessionId);
      selectSession(sessionId);
    });
    onAfterNavigate?.();
  };

  const toggleWorkspace = (workspaceId: string) => {
    setCollapsedWorkspaceIds((current) =>
      current.includes(workspaceId)
        ? current.filter((id) => id !== workspaceId)
        : [...current, workspaceId],
    );
  };

  const handleRemoveWorkspace = async (workspaceId: string) => {
    // Backend cascade-deletes sessions + their children in a single
    // transaction; mirror that on the frontend store so the sidebar updates
    // immediately without waiting for a bootstrap roundtrip.
    try {
      await desktopApi.deleteWorkspace(workspaceId);
    } catch {
      // Keep the sidebar in sync with the database: nothing was removed.
      toast.error(t("sessions:workspace.removeFailed"));
      return;
    }
    removeSessionsByWorkspace(workspaceId);
    removeWorkspace(workspaceId);
  };

  const handleRevealWorkspace = async (rootPath: string) => {
    try {
      await desktopApi.openWorkspaceInFileManager(rootPath);
    } catch {
      // openPath surfaces OS errors as resolved strings; swallow so the UI
      // is not blocked. A toast layer would belong here but is out of scope.
    }
  };

  const handleSelectSession = (workspaceId: string, sessionId: string) => {
    startSessionSwitchLongTaskObserver(sessionId);
    markSessionSwitch(sessionId, "click", { workspaceId });
    startTransition(() => {
      setOptimisticActiveSessionId(sessionId);
      selectWorkspace(workspaceId);
      selectSession(sessionId);
    });
    onAfterNavigate?.();
  };

  const openInboxItem = (item: InboxItem) => {
    void inboxApi.read(item.id).catch((error: unknown) =>
      logRendererDiagnostic("info", "inbox.readFailed", {
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    if (!item.sessionId) return;
    if (item.form === "work" && item.workspaceId) {
      handleSelectSession(item.workspaceId, item.sessionId);
      return;
    }
    selectFormSession(item.sessionId);
  };

  const isWorkspacesTab = activeTab === "workspaces";
  const addWorkspaceLabel = t("sessions:sidebar.addWorkspace", {
    defaultValue: "Add workspace",
  });
  const listSections = (
    <SessionListSections
      headingActions={
        <SessionListViewMenu
          agentIds={sessionView.agentIds}
          allCollapsed={sessionView.allCollapsed}
          onMarkAllRead={sessionView.markAllRead}
          onToggleCollapseAll={sessionView.toggleCollapseAll}
          unreadCount={sessionView.unreadCount}
        />
      }
      onSelectSession={handleSelectSession}
      optimisticActiveSessionId={optimisticActiveSessionId}
      sessions={sessionView.pinnedSessions}
      workspaceNames={sessionView.workspaceNames}
    />
  );

  return (
    <SidebarShell>
      <SidebarTopSlot
        headerStart={headerStart}
        hideTitlebarSpacer={hideTitlebarSpacer}
      />

      {/* Start-only padding so ScrollArea roots reach the edge and the custom
          thumb sits flush right; every row (chrome and list alike) takes its
          end inset from a pe-3 parent so the hover fills line up. */}
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ps-3",
          !showFooter && "pb-4",
        )}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          <div className="flex shrink-0 items-center gap-0.5 pe-1.25">
            <SidebarFormSwitcher
              onValueChange={switchSidebarTab}
              value={activeTab}
            />
            <div className="min-w-0 flex-1" />
            {activeTab === "personal" ? (
              <BriefControl onOpenSession={selectFormSession} />
            ) : null}
            {isWorkspacesTab ? (
              <AppSidebarIconButton
                aria-label={addWorkspaceLabel}
                onClick={() => {
                  void openWorkspace();
                }}
              >
                <FolderPlus className="size-3.5" />
              </AppSidebarIconButton>
            ) : null}
            <AppSidebarIconButton
              aria-label={create.label}
              onClick={create.run}
            >
              <SquarePen className="size-3.5" />
            </AppSidebarIconButton>
          </div>

          {activeTab === "workspaces" ? (
            <div className="flex min-h-0 flex-1 flex-col">
              {sessionView.grouping === "workspace" ? (
                <WorkspacesPanel
                  leading={listSections}
                  activeWorkspaceId={activeWorkspaceId}
                  collapsedWorkspaceIds={collapsedWorkspaceIds}
                  filtered={sessionView.filtered}
                  onCreateAgent={createSession}
                  onRemoveWorkspace={(id) => {
                    void handleRemoveWorkspace(id);
                  }}
                  onReorderWorkspaces={(activeId, overId) => {
                    reorderWorkspaces({ activeId, overId });
                  }}
                  onRevealWorkspace={(rootPath) => {
                    void handleRevealWorkspace(rootPath);
                  }}
                  onSelectSession={handleSelectSession}
                  onToggleWorkspace={toggleWorkspace}
                  optimisticActiveSessionId={optimisticActiveSessionId}
                  sessionsByWorkspace={sessionView.sessionsByWorkspace}
                  workspaces={sessionView.visibleWorkspaces}
                />
              ) : (
                <SessionGroupsPanel
                  hasPinnedSessions={sessionView.pinnedSessions.length > 0}
                  leading={listSections}
                  filtered={sessionView.filtered}
                  grouping={sessionView.grouping}
                  groups={sessionView.groups}
                  onSelectSession={handleSelectSession}
                  optimisticActiveSessionId={optimisticActiveSessionId}
                  workspaceNames={sessionView.workspaceNames}
                />
              )}
            </div>
          ) : null}
          {activeTab === "chat" ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <ChatSessionsPanel
                activeSessionId={optimisticActiveSessionId}
                onSelectSession={selectFormSession}
                sessions={chatSessions}
              />
            </div>
          ) : null}
          {activeTab === "personal" ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <PersonalAgentsPanel
                activeSessionId={optimisticActiveSessionId}
                onOpenInboxItem={openInboxItem}
                onSelectSession={selectFormSession}
              />
            </div>
          ) : null}
        </div>
      </div>
      {showFooter ? (
        <SidebarFooter isAssistant={activeTab === "personal"} />
      ) : null}
      <ArchiveGroupDialog />
    </SidebarShell>
  );
}
