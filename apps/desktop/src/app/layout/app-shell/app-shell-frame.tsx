import type { MessageAttachment } from "@cocurdex/shared";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import type { Ref } from "react";
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { setChatComposerAttachmentAtom } from "@/features/editor";
import {
  OnboardingView,
  onboardingDismissedAtom,
  onboardingEnteredAtom,
} from "@/features/onboarding";
import {
  providerConfigsAtom,
  providerModelsLoadedAtom,
  selectSessionAtom,
} from "@/features/sessions";
import type {
  AppearanceSettings,
  NotificationSettings,
  ThemeMode,
} from "@/features/settings";
import { SettingsScreen } from "@/features/settings";
import {
  openWorkspaceByPathAtom,
  pickHostDirectoryAtom,
  useWorkspaceFolderDrop,
  WorkspaceFolderDropOverlay,
  workspacesAtom,
} from "@/features/workspaces";
import type { LanguageMode } from "@/i18n/language";
import type { WorkspaceFileEntry } from "@/lib";
import { cn } from "@/lib";
import { requestChatContextAtom } from "@/lib/chat-context-store";
import { CHAT_DOCK_ACTIONS_INSET } from "../chat-dock-actions";
import type { ChatDockVisibility } from "../chat-dock-geometry";
import type { ChatLayoutMode } from "../chat-layout-preference";
import { useChatBrowserContext } from "../chat-window/chat-browser-context";
import { useChatContext } from "../chat-window/use-chat-context";
import { SessionSplitLayout } from "../session-split";
import {
  ScreenNavButtons,
  SearchPalette,
  SidebarToggleButton,
} from "../sidebar";
import { sidebarTabAtom } from "../sidebar/sidebar-tab-store";
import { appBootstrappedAtom } from "./app-bootstrap-store";
import { AppShellContent } from "./app-shell-content";
import {
  TITLEBAR_EDITOR_TOGGLE_WIDTH,
  TITLEBAR_HEIGHT,
  TITLEBAR_PANE_HEADER_START_INSET,
  TITLEBAR_TRAFFIC_LIGHT_RESERVE,
} from "./app-shell-layout";
import { AppShellTitlebarActions } from "./app-shell-titlebar-actions";
import type { AppScreen, SettingsSectionId } from "./app-shell-types";
import { BootSplash } from "./boot-splash";

interface AppShellFrameProps {
  activeScreen: AppScreen;
  activeSettingsSection: SettingsSectionId;
  activeWorkspaceRootPaths: string[];
  appearanceSettings: AppearanceSettings;
  canGoBack: boolean;
  canGoForward: boolean;
  contentRowRef: Ref<HTMLElement>;
  effectiveRightWidth: number;
  /** Visible in the app shell (may be forced closed while editor is fullscreen). */
  isLeftSidebarOpen: boolean;
  /**
   * User preference for the left rail. Settings uses this so the nav can open
   * even when the underlying app shell is in editor-fullscreen (global) mode.
   */
  isLeftSidebarPreferredOpen: boolean;
  isRightPanelOpen: boolean;
  isRightPanelMaximized: boolean;
  isPanelFullWidth: boolean;
  isChatDetached: boolean;
  isRightPanelCompact: boolean;
  chatDockVisibility: ChatDockVisibility;
  isChatDockPinned: boolean;
  isSearchOpen: boolean;
  leftWidth: number;
  languageMode: LanguageMode;
  notificationSettings: NotificationSettings;
  chatLayoutMode: ChatLayoutMode;
  hideFabWhenClosed: boolean;
  rightWidth: number;
  themeMode: ThemeMode;
  onAppearanceSettingsChange(settings: AppearanceSettings): void;
  onChatLayoutModeChange(mode: ChatLayoutMode): void;
  onHideFabWhenClosedChange(hide: boolean): void;
  onGoBack(): void;
  onGoForward(): void;
  onOpenFileFromPalette(file: WorkspaceFileEntry): void;
  onOpenSettings(): void;
  onResizeHandleMouseDown(
    target: "left" | "right",
    event: React.MouseEvent,
  ): void;
  onSearchClose(): void;
  onSettingsSectionChange(section: SettingsSectionId): void;
  onLanguageModeChange(languageMode: LanguageMode): void;
  onNotificationSettingsChange(settings: NotificationSettings): void;
  onThemeModeChange(themeMode: ThemeMode): void;
  onToggleLeftSidebar(): void;
  onToggleRightPanel(): void;
  onToggleRightPanelMaximize(): void;
  onChatDockVisibilityChange(visibility: ChatDockVisibility): void;
  onChatDockPinnedChange(pinned: boolean): void;
}

export function AppShellFrame({
  activeScreen,
  activeSettingsSection,
  activeWorkspaceRootPaths,
  appearanceSettings,
  canGoBack,
  canGoForward,
  contentRowRef,
  effectiveRightWidth,
  isLeftSidebarOpen,
  isLeftSidebarPreferredOpen,
  isRightPanelOpen,
  isRightPanelMaximized,
  isPanelFullWidth,
  isChatDetached,
  isRightPanelCompact,
  chatDockVisibility,
  isChatDockPinned,
  isSearchOpen,
  leftWidth,
  languageMode,
  notificationSettings,
  chatLayoutMode,
  hideFabWhenClosed,
  onAppearanceSettingsChange,
  onChatLayoutModeChange,
  onHideFabWhenClosedChange,
  onGoBack,
  onGoForward,
  onOpenFileFromPalette,
  onOpenSettings,
  onResizeHandleMouseDown,
  onSearchClose,
  onSettingsSectionChange,
  onLanguageModeChange,
  onNotificationSettingsChange,
  onThemeModeChange,
  onToggleLeftSidebar,
  onToggleRightPanel,
  onToggleRightPanelMaximize,
  onChatDockVisibilityChange,
  onChatDockPinnedChange,
  rightWidth,
  themeMode,
}: AppShellFrameProps) {
  const { t } = useTranslation(["editor", "sessions"]);
  const appBootstrapped = useAtomValue(appBootstrappedAtom);
  const workspaces = useAtomValue(workspacesAtom);
  const providerConfigs = useAtomValue(providerConfigsAtom);
  const providerModelsLoaded = useAtomValue(providerModelsLoadedAtom);
  const onboardingDismissed = useAtomValue(onboardingDismissedAtom);
  // Decided once, when the snapshot and provider rows are both in: opening a
  // project from the welcome screen fills the workspace list, and re-deriving
  // from that would yank the screen away mid-flow.
  const onboardingNeededRef = useRef<boolean | null>(null);
  if (
    onboardingNeededRef.current === null &&
    appBootstrapped &&
    providerModelsLoaded
  ) {
    onboardingNeededRef.current =
      workspaces.length === 0 && providerConfigs.length === 0;
  }
  const onboardingNeeded = onboardingNeededRef.current;
  const [onboardingEntered, setOnboardingEntered] = useAtom(
    onboardingEnteredAtom,
  );
  const setSidebarTab = useSetAtom(sidebarTabAtom);
  const composerRef = useChatContext(() => onChatDockVisibilityChange("open"));
  useChatBrowserContext();
  const requestChatContext = useSetAtom(requestChatContextAtom);
  const setChatComposerAttachment = useSetAtom(setChatComposerAttachmentAtom);
  const openWorkspaceByPath = useSetAtom(openWorkspaceByPathAtom);
  const pickHostDirectory = useSetAtom(pickHostDirectoryAtom);
  const selectSession = useSetAtom(selectSessionAtom);
  const handleAddContextToChat = useCallback(
    (attachment: MessageAttachment) => {
      setChatComposerAttachment(attachment);
      return true;
    },
    [setChatComposerAttachment],
  );
  const handleInsertTextToChat = useCallback(
    (text: string) => {
      requestChatContext({ kind: "text", text });
      return true;
    },
    [requestChatContext],
  );

  // Match CLI / "Open Folder": activate project and clear foreign session UI.
  const handleOpenDroppedWorkspace = useCallback(
    (rootPath: string) => {
      openWorkspaceByPath(rootPath);
      selectSession(null);
    },
    [openWorkspaceByPath, selectSession],
  );
  const { isDraggingFolder, dropHandlers } = useWorkspaceFolderDrop(
    handleOpenDroppedWorkspace,
  );
  const handleOpenWorkspaceFromDialog = useCallback(async () => {
    const rootPath = await pickHostDirectory();
    if (!rootPath) {
      return;
    }
    handleOpenDroppedWorkspace(rootPath);
  }, [handleOpenDroppedWorkspace, pickHostDirectory]);

  // One chat node shared by the center column and the floating dock. Only one
  // mount point renders it at a time (center when side by side, dock when the
  // editor is fullscreen), so chat state and composerRef survive the switch.
  // The dock drops the titlebar spacer but keeps the session pane header.
  const splitChatNode = (
    <SessionSplitLayout
      headerEndInset={
        isRightPanelCompact && !isRightPanelMaximized
          ? CHAT_DOCK_ACTIONS_INSET
          : 0
      }
      headerStartInset={
        !isLeftSidebarOpen && !isRightPanelCompact
          ? TITLEBAR_PANE_HEADER_START_INSET
          : 0
      }
      composerRef={composerRef}
      hideTitlebarSpacer={isRightPanelMaximized}
      hideSinglePaneHeader={isRightPanelMaximized}
    />
  );

  // Before the snapshot lands the stores are empty, which is indistinguishable
  // from a fresh install. Show the mark instead of an app frame full of empty
  // panels — hooks above have already run, so bootstrap is underway.
  // Provider rows load alongside the snapshot; deciding before both are in
  // would flash the welcome screen at an install that is already configured.
  if (!appBootstrapped || onboardingNeeded === null) {
    return <BootSplash />;
  }

  // Nothing is set up yet: no project to open and no provider to talk to. The
  // welcome screen replaces the frame entirely — sidebar and panels have
  // nothing to list. Leaving it is always an explicit choice, so setup done
  // inside it never yanks the screen away mid-flow.
  if (
    activeScreen === "app" &&
    onboardingNeeded &&
    !onboardingDismissed &&
    !onboardingEntered
  ) {
    return (
      <OnboardingView
        onEnterApp={() => setOnboardingEntered(true)}
        onOpenWorkspace={() => void handleOpenWorkspaceFromDialog()}
        onSkip={() => setOnboardingEntered(true)}
        onStartChat={() => {
          setOnboardingEntered(true);
          setSidebarTab("chat");
        }}
        titlebarHeight={TITLEBAR_HEIGHT}
      />
    );
  }

  return (
    <div
      className="relative h-screen overflow-hidden bg-background text-foreground"
      {...dropHandlers}
    >
      <WorkspaceFolderDropOverlay active={isDraggingFolder} />
      <div
        aria-hidden={activeScreen !== "app"}
        className={cn(
          "absolute inset-0 transition-all duration-300 ease-out",
          activeScreen === "app"
            ? "pointer-events-auto translate-x-0 opacity-100"
            : "pointer-events-none -translate-x-4 opacity-0",
        )}
      >
        <div className="relative flex h-screen flex-col overflow-hidden bg-app text-app-foreground">
          <header
            className="absolute inset-x-0 top-0 z-30 flex select-none items-center"
            style={{ height: TITLEBAR_HEIGHT }}
          >
            {/*
              Toolbar box clamped to the sidebar width. Its footprint
              (traffic-light reserve + 3 size-6 pills + gaps) drives
              MIN_LEFT in app-shell-layout.ts; keep them in sync or the
              trailing forward arrow overflows past the sidebar separator.
            */}
            <div
              className="app-drag flex h-full shrink-0 items-center"
              style={{
                width: isLeftSidebarOpen ? leftWidth : undefined,
                paddingInlineStart: TITLEBAR_TRAFFIC_LIGHT_RESERVE,
              }}
            >
              {/*
                Hidden in global mode: the left sidebar is collapsed, so these
                sidebar-scoped controls would otherwise float on top of the
                fullscreen editor's view switcher.
              */}
              <div
                className={cn(
                  // Vertically center size-6 pills in TITLEBAR_HEIGHT (no mt).
                  "app-no-drag items-center gap-1",
                  isPanelFullWidth ? "hidden" : "flex",
                )}
              >
                <SidebarToggleButton
                  ariaLabel={t("editor:actions.toggleSidebar")}
                  onToggle={onToggleLeftSidebar}
                />
                <ScreenNavButtons
                  backLabel={t("editor:actions.goBack")}
                  canGoBack={canGoBack}
                  canGoForward={canGoForward}
                  forwardLabel={t("editor:actions.goForward")}
                  onGoBack={onGoBack}
                  onGoForward={onGoForward}
                />
              </div>
            </div>

            <div
              className="app-drag min-w-0 flex-1 self-stretch"
              data-testid="titlebar-drag-region"
            />

            <div
              className="app-drag flex h-full shrink-0 items-center justify-end px-3"
              style={{
                width: isRightPanelOpen
                  ? Math.max(
                      0,
                      effectiveRightWidth - TITLEBAR_EDITOR_TOGGLE_WIDTH,
                    )
                  : undefined,
              }}
            />
          </header>

          <AppShellTitlebarActions
            isChatDetached={isChatDetached}
            isRightPanelOpen={isRightPanelOpen}
            isRightPanelMaximized={isRightPanelMaximized}
            onToggleRightPanel={onToggleRightPanel}
            onToggleRightPanelMaximize={onToggleRightPanelMaximize}
            onOpenSettings={onOpenSettings}
          />

          <AppShellContent
            isRightPanelCompact={isRightPanelCompact}
            contentRowRef={contentRowRef}
            isLeftSidebarOpen={isLeftSidebarOpen}
            leftWidth={leftWidth}
            isRightPanelOpen={isRightPanelOpen}
            isRightPanelMaximized={isRightPanelMaximized}
            isPanelFullWidth={isPanelFullWidth}
            rightWidth={rightWidth}
            appearanceSettings={appearanceSettings}
            splitChatNode={splitChatNode}
            chatDockVisibility={chatDockVisibility}
            isChatDockPinned={isChatDockPinned}
            hideFabWhenClosed={hideFabWhenClosed}
            onResizeHandleMouseDown={onResizeHandleMouseDown}
            onToggleRightPanel={onToggleRightPanel}
            onAddContextToChat={handleAddContextToChat}
            onInsertTextToChat={handleInsertTextToChat}
            onChatDockVisibilityChange={onChatDockVisibilityChange}
            onChatDockPinnedChange={onChatDockPinnedChange}
          />
        </div>

        <SearchPalette
          activeWorkspaceRootPaths={activeWorkspaceRootPaths}
          onClose={onSearchClose}
          onOpenFile={onOpenFileFromPalette}
          open={isSearchOpen}
        />
      </div>

      {activeScreen === "settings" ? (
        <div className="absolute inset-0">
          <SettingsScreen
            activeSection={activeSettingsSection}
            appearanceSettings={appearanceSettings}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            chatLayoutMode={chatLayoutMode}
            hideFabWhenClosed={hideFabWhenClosed}
            isSidebarOpen={isLeftSidebarPreferredOpen}
            sidebarWidth={leftWidth}
            onGoBack={onGoBack}
            onGoForward={onGoForward}
            languageMode={languageMode}
            notificationSettings={notificationSettings}
            onAppearanceSettingsChange={onAppearanceSettingsChange}
            onChatLayoutModeChange={onChatLayoutModeChange}
            onHideFabWhenClosedChange={onHideFabWhenClosedChange}
            onLanguageModeChange={onLanguageModeChange}
            onNotificationSettingsChange={onNotificationSettingsChange}
            onResizeSidebar={(event) => onResizeHandleMouseDown("left", event)}
            onSectionChange={onSettingsSectionChange}
            onThemeModeChange={onThemeModeChange}
            onToggleSidebar={onToggleLeftSidebar}
            themeMode={themeMode}
          />
        </div>
      ) : null}
    </div>
  );
}
