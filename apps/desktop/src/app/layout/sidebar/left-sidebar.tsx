import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { Plus } from "lucide-react";
import { type ReactNode, startTransition, useMemo, useOptimistic } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  SidebarListRow,
  SidebarListRowLabel,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import { activeConversationIdAtom, conversationsAtom } from "@/features/chat";
import {
  activeSessionIdAtom,
  removeSessionsByWorkspaceAtom,
  selectSessionAtom,
  sessionsAtom,
} from "@/features/sessions";
import {
  activeWorkspaceIdAtom,
  collapsedWorkspaceIdsAtom,
  openWorkspaceByPathAtom,
  removeWorkspaceAtom,
  selectWorkspaceAtom,
  workspacesAtom,
} from "@/features/workspaces";
import {
  desktopApi,
  markSessionSwitch,
  startSessionSwitchLongTaskObserver,
} from "@/lib";
import { ConversationsPanel } from "./conversations-panel";
import { ProjectsPanel } from "./projects-panel";
import { type SidebarTab, sidebarTabAtom } from "./sidebar-tab-store";

interface LeftSidebarProps {
  // Dock reuse: drop the titlebar spacer (the dock has its own header) and
  // fire onAfterNavigate so the dock drawer can auto-close once a target is
  // picked. headerStart slots chrome (e.g. session-list toggle) into the same
  // bg-sidebar column so the dock drawer matches the main sidebar paint path.
  headerStart?: ReactNode;
  hideTitlebarSpacer?: boolean;
  onAfterNavigate?(): void;
}

// Segmented control in sidebar tones. Selected state keys off `data-active`:
// Base UI renamed the Tabs.Tab attribute, so the `data-selected:` variants the
// shadcn template ships never match and have to be re-stated here.
function SidebarTabTrigger({
  children,
  value,
}: {
  children: ReactNode;
  value: SidebarTab;
}) {
  return (
    <TabsTrigger
      className="h-6 flex-1 rounded-control px-2 text-body font-medium text-sidebar-fg-subtle hover:text-sidebar-fg-muted dark:text-sidebar-fg-subtle dark:hover:text-sidebar-fg-muted data-active:bg-background data-active:text-sidebar-fg data-active:shadow-sm dark:data-active:bg-background dark:data-active:text-sidebar-fg"
      value={value}
    >
      {children}
    </TabsTrigger>
  );
}

function SidebarShell({ children }: { children?: ReactNode }) {
  return (
    <aside className="sidebar-scrollbar @container/sidebar flex h-full min-w-0 flex-col border-r border-sidebar-border bg-sidebar">
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
}: LeftSidebarProps) {
  const { t } = useTranslation(["sessions", "chat"]);
  const workspaces = useAtomValue(workspacesAtom);
  const sessions = useAtomValue(sessionsAtom);
  const activeWorkspaceId = useAtomValue(activeWorkspaceIdAtom);
  const activeSessionId = useAtomValue(activeSessionIdAtom);
  const selectWorkspace = useSetAtom(selectWorkspaceAtom);
  const setActiveWorkspaceId = useSetAtom(activeWorkspaceIdAtom);
  const openWorkspaceByPath = useSetAtom(openWorkspaceByPathAtom);
  const removeWorkspace = useSetAtom(removeWorkspaceAtom);
  const removeSessionsByWorkspace = useSetAtom(removeSessionsByWorkspaceAtom);
  const selectSession = useSetAtom(selectSessionAtom);
  // Pure chat conversations share the center panel with agent sessions, so
  // they live in the same sidebar — see docs/plans/2026-05-21-chat-mode.md.
  const conversations = useAtomValue(conversationsAtom);
  const activeConversationId = useAtomValue(activeConversationIdAtom);
  const setActiveConversationId = useSetAtom(activeConversationIdAtom);
  const [optimisticActiveSessionId, setOptimisticActiveSessionId] =
    useOptimistic(activeSessionId);
  const [collapsedWorkspaceIds, setCollapsedWorkspaceIds] = useAtom(
    collapsedWorkspaceIdsAtom,
  );
  // Projects and chat are alternate views of the same rail, not two stacked
  // lists: only one list competes for the sidebar height at a time. The center
  // panel reads the same atom so its empty state matches the visible tab.
  const [activeTab, setActiveTab] = useAtom(sidebarTabAtom);

  const sessionsByWorkspace = useMemo(
    () =>
      sessions.reduce<Record<string, typeof sessions>>(
        (accumulator, session) => {
          if (!accumulator[session.workspaceId]) {
            accumulator[session.workspaceId] = [];
          }
          accumulator[session.workspaceId].push(session);
          return accumulator;
        },
        {},
      ),
    [sessions],
  );

  const handleOpenWorkspace = async () => {
    const result = await desktopApi.openWorkspace();
    if (result.canceled || result.filePaths.length === 0) return;
    const { didSwitchProject } = openWorkspaceByPath(result.filePaths[0]);
    if (didSwitchProject) {
      setActiveConversationId(null);
      selectSession(null);
    }
  };

  const handleCreateAgent = (workspaceId?: string) => {
    const targetWorkspaceId = workspaceId ?? activeWorkspaceId;
    if (!targetWorkspaceId) {
      void handleOpenWorkspace();
      return;
    }

    setActiveConversationId(null);
    startTransition(() => {
      setOptimisticActiveSessionId(null);
      selectWorkspace(targetWorkspaceId);
      selectSession(null);
    });
    onAfterNavigate?.();
  };

  // Pure chat is workspace-independent, so its list is its own sidebar tab.
  // Mirror handleNewSession: open a blank draft surface instead of
  // eagerly persisting a record. Clearing the workspace forces the center
  // panel to render NewConversationCard; the conversation is created only when
  // the user sends the first message (handleStartConversation), matching the
  // way agent sessions defer creation until the first turn.
  const handleCreateConversation = () => {
    setActiveConversationId(null);
    startTransition(() => {
      setOptimisticActiveSessionId(null);
      setActiveWorkspaceId(null);
      selectSession(null);
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
    // If the user happened to be viewing a session from this workspace,
    // their selection is invalid now — clear it and any active conversation
    // so the center panel falls back to its empty state.
    setActiveConversationId(null);
    selectSession(null);
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
    // Clear any active pure-chat selection so the center panel switches
    // back to the agent view.
    setActiveConversationId(null);
    startTransition(() => {
      setOptimisticActiveSessionId(sessionId);
      selectWorkspace(workspaceId);
      selectSession(sessionId);
    });
    onAfterNavigate?.();
  };

  // The trailing tab action follows the visible list: add a project, or start
  // a new chat. One button instead of two per-section actions.
  // Same glyph on both tabs — only the label changes, so the row does not
  // appear to swap controls when switching tabs.
  const isProjectsTab = activeTab === "projects";
  const tabAction = isProjectsTab
    ? {
        label: t("sessions:sidebar.addProject", {
          defaultValue: "Add project",
        }),
        onClick: () => {
          void handleOpenWorkspace();
        },
      }
    : {
        label: t("chat:list.new", { defaultValue: "New chat" }),
        onClick: handleCreateConversation,
      };

  return (
    <SidebarShell>
      <SidebarTopSlot
        headerStart={headerStart}
        hideTitlebarSpacer={hideTitlebarSpacer}
      />

      {/* Start-only padding so ScrollArea roots reach the edge and the custom
          thumb sits flush right; every row (chrome and list alike) takes its
          end inset from a pe-3 parent so the hover fills line up. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ps-3 pb-4">
        <Tabs
          className="flex min-h-0 min-w-0 flex-1 flex-col gap-2"
          onValueChange={(value) => setActiveTab(value as SidebarTab)}
          value={activeTab}
        >
          {/* pe-3 (not a margin on the child) so these rows end on the same
              gutter as the list rows below, whose inset comes from the
              scroll area's pe-3 padding. */}
          <div className="shrink-0 pe-3">
            <TabsList className="h-7 w-full gap-0.5 rounded-control bg-sidebar-surface-active p-0.5">
              <SidebarTabTrigger value="projects">
                {t("sessions:sidebar.projectsGroup", {
                  defaultValue: "Work",
                })}
              </SidebarTabTrigger>
              <SidebarTabTrigger value="chat">
                {t("chat:sidebar.title", { defaultValue: "Chat" })}
              </SidebarTabTrigger>
            </TabsList>
          </div>

          {/* Create action for the visible tab, as its own row above the list
              (same row contract as the list leaves below it). */}
          <div className="shrink-0 pe-3">
            <SidebarListRow
              className="ps-1 pe-0"
              render={
                <button
                  type="button"
                  aria-label={tabAction.label}
                  onClick={tabAction.onClick}
                />
              }
            >
              <Plus />
              <SidebarListRowLabel>{tabAction.label}</SidebarListRowLabel>
            </SidebarListRow>
          </div>

          <TabsContent
            className="flex min-h-0 flex-1 flex-col"
            value="projects"
          >
            <ProjectsPanel
              activeConversationId={activeConversationId}
              activeWorkspaceId={activeWorkspaceId}
              collapsedWorkspaceIds={collapsedWorkspaceIds}
              onCreateAgent={handleCreateAgent}
              onRemoveWorkspace={(id) => {
                void handleRemoveWorkspace(id);
              }}
              onRevealWorkspace={(rootPath) => {
                void handleRevealWorkspace(rootPath);
              }}
              onSelectSession={handleSelectSession}
              onSelectWorkspace={selectWorkspace}
              onToggleWorkspace={toggleWorkspace}
              optimisticActiveSessionId={optimisticActiveSessionId}
              sessionsByWorkspace={sessionsByWorkspace}
              workspaces={workspaces}
            />
          </TabsContent>

          <TabsContent className="flex min-h-0 flex-1 flex-col" value="chat">
            <ConversationsPanel
              activeConversationId={activeConversationId}
              conversations={conversations}
              onSelectConversation={(conversationId) => {
                selectSession(null);
                setActiveConversationId(conversationId);
                onAfterNavigate?.();
              }}
            />
          </TabsContent>
        </Tabs>
      </div>
    </SidebarShell>
  );
}
