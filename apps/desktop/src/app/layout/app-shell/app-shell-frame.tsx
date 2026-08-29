import { isContextAttachment, type MessageAttachment } from "@cocurdex/shared";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { Maximize2, Minimize2, PanelRight, Settings } from "lucide-react";
import type { Ref } from "react";
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { activeConversationIdAtom } from "@/features/chat";
import type { ChatComposerHandle } from "@/features/composer";
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
import { NetworkProxyStatusButton, SettingsScreen } from "@/features/settings";
import {
  openWorkspaceByPathAtom,
  useWorkspaceFolderDrop,
  WorkspaceFolderDropOverlay,
  workspacesAtom,
} from "@/features/workspaces";
import type { LanguageMode } from "@/i18n/language";
import type { WorkspaceFileEntry } from "@/lib";
import { cn, desktopApi } from "@/lib";
import { CenterPanel } from "../center-panel";
import { ChatDock } from "../chat-dock";
import {
  type ChatDockVisibility,
  closedChatDockVisibility,
} from "../chat-dock-geometry";
import type { ChatLayoutMode } from "../chat-layout-preference";
import { RightEditorPanel } from "../right-editor-panel";
import {
  LeftSidebar,
  ResizableSidebarSlot,
  ResizeSeparator,
  ScreenNavButtons,
  SearchPalette,
  SidebarToggleButton,
} from "../sidebar";
import { sidebarTabAtom } from "../sidebar/sidebar-tab-store";
import {
  TITLEBAR_ICON_GLYPH_CLASS,
  TitlebarIconButton,
} from "../titlebar-icon-button";
import { appBootstrappedAtom } from "./app-bootstrap-store";
import {
  TITLEBAR_EDITOR_TOGGLE_WIDTH,
  TITLEBAR_HEIGHT,
  TITLEBAR_TRAFFIC_LIGHT_RESERVE,
} from "./app-shell-layout";
import type { AppScreen, SettingsSectionId } from "./app-shell-types";
import { BootSplash } from "./boot-splash";

interface AppShellFrameProps {
  activeScreen: AppScreen;
  activeSettingsSection: SettingsSectionId;
  activeWorkspaceRootPath: string | null;
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
  activeWorkspaceRootPath,
  appearanceSettings,
  canGoBack,
  canGoForward,
  contentRowRef,
  effectiveRightWidth,
  isLeftSidebarOpen,
  isLeftSidebarPreferredOpen,
  isRightPanelOpen,
  isRightPanelMaximized,
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
  const composerRef = useRef<ChatComposerHandle>(null);
  const setChatComposerAttachment = useSetAtom(setChatComposerAttachmentAtom);
  const openWorkspaceByPath = useSetAtom(openWorkspaceByPathAtom);
  const selectSession = useSetAtom(selectSessionAtom);
  const setActiveConversationId = useSetAtom(activeConversationIdAtom);
  const handleAddContextToChat = useCallback(
    (attachment: MessageAttachment) => {
      if (
        isContextAttachment(attachment) &&
        composerRef.current?.insertContextMention(attachment)
      ) {
        return true;
      }

      setChatComposerAttachment(attachment);
      return false;
    },
    [setChatComposerAttachment],
  );
  const handleInsertTextToChat = useCallback((text: string) => {
    return composerRef.current?.insertText(text) ?? false;
  }, []);

  // Match CLI / "Open Folder": activate project and clear foreign session UI.
  const handleOpenDroppedWorkspace = useCallback(
    (rootPath: string) => {
      openWorkspaceByPath(rootPath);
      selectSession(null);
      setActiveConversationId(null);
    },
    [openWorkspaceByPath, selectSession, setActiveConversationId],
  );
  const { isDraggingFolder, dropHandlers } = useWorkspaceFolderDrop(
    handleOpenDroppedWorkspace,
  );
  const handleOpenWorkspaceFromDialog = useCallback(async () => {
    const result = await desktopApi.openWorkspace();
    if (result.canceled || result.filePaths.length === 0) {
      return;
    }
    handleOpenDroppedWorkspace(result.filePaths[0]);
  }, [handleOpenDroppedWorkspace]);

  // Single CenterPanel instance shared between the center column and the
  // floating dock. Only one mount point renders it at a time (center when
  // split, dock when the editor is fullscreen), so chat state and composerRef
  // survive the switch. In the dock it drops the titlebar spacer.
  const chatNode = (
    <CenterPanel
      composerRef={composerRef}
      hideTitlebarSpacer={isRightPanelMaximized}
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
                  isRightPanelMaximized ? "hidden" : "flex",
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

          <div
            className="app-no-drag absolute top-0 right-0 z-[60] flex items-center justify-end gap-1 px-3"
            data-testid="titlebar-editor-toggle-region"
            style={{
              height: TITLEBAR_HEIGHT,
              width: TITLEBAR_EDITOR_TOGGLE_WIDTH,
            }}
          >
            <NetworkProxyStatusButton />
            {isRightPanelOpen ? (
              <TitlebarIconButton
                active={isRightPanelMaximized}
                aria-label={
                  isRightPanelMaximized
                    ? t("editor:actions.exitEditorFullscreen")
                    : t("editor:actions.enterEditorFullscreen")
                }
                cursor="default"
                onClick={onToggleRightPanelMaximize}
              >
                {isRightPanelMaximized ? (
                  <Minimize2 className={TITLEBAR_ICON_GLYPH_CLASS} />
                ) : (
                  <Maximize2 className={TITLEBAR_ICON_GLYPH_CLASS} />
                )}
              </TitlebarIconButton>
            ) : null}
            <TitlebarIconButton
              active={isRightPanelOpen}
              aria-label={t("editor:actions.toggleEditorPanel")}
              cursor="default"
              onClick={onToggleRightPanel}
            >
              <PanelRight className={TITLEBAR_ICON_GLYPH_CLASS} />
            </TitlebarIconButton>
            <TitlebarIconButton
              aria-label={t("sessions:sidebar.settings")}
              cursor="default"
              onClick={() => onOpenSettings()}
            >
              <Settings className={TITLEBAR_ICON_GLYPH_CLASS} />
            </TitlebarIconButton>
          </div>

          <main
            className="relative flex min-h-0 flex-1 overflow-hidden bg-app"
            ref={contentRowRef}
          >
            <ResizableSidebarSlot
              isOpen={isLeftSidebarOpen}
              width={leftWidth}
              onResizeMouseDown={(event) =>
                onResizeHandleMouseDown("left", event)
              }
            >
              <LeftSidebar />
            </ResizableSidebarSlot>

            {isRightPanelMaximized ? null : (
              <div className="flex-1 overflow-hidden">{chatNode}</div>
            )}

            {isRightPanelOpen ? (
              <>
                {isRightPanelMaximized ? null : (
                  <ResizeSeparator
                    testId="panel-separator"
                    onMouseDown={(event) =>
                      onResizeHandleMouseDown("right", event)
                    }
                  />
                )}
                <div
                  className={
                    // min-w-0: allow this flex item to shrink when the pinned
                    // chat dock grows (default min-width:auto is content-sized
                    // and Monaco long lines block the drag-left resize).
                    isRightPanelMaximized
                      ? "min-w-0 flex-1 overflow-hidden"
                      : "shrink-0"
                  }
                  style={
                    isRightPanelMaximized ? undefined : { width: rightWidth }
                  }
                >
                  <RightEditorPanel
                    appearanceSettings={appearanceSettings}
                    onAddContextToChat={handleAddContextToChat}
                    onInsertTextToChat={handleInsertTextToChat}
                    reserveTrafficLights={isRightPanelMaximized}
                  />
                </div>
              </>
            ) : null}

            {/*
              Mount inside main so pin mode can join the flex row and squeeze
              the editor; floating mode still uses absolute positioning within
              this relative main and does not take flex space.
            */}
            {isRightPanelMaximized ? (
              <ChatDock
                visibility={chatDockVisibility}
                pinned={isChatDockPinned}
                onOpen={() => onChatDockVisibilityChange("open")}
                onClose={() =>
                  onChatDockVisibilityChange(
                    closedChatDockVisibility(hideFabWhenClosed),
                  )
                }
                onHideFab={() => onChatDockVisibilityChange("hidden")}
                onPinnedChange={onChatDockPinnedChange}
              >
                {chatDockVisibility === "open" ? chatNode : null}
              </ChatDock>
            ) : null}
          </main>
        </div>

        <SearchPalette
          activeWorkspaceRootPath={activeWorkspaceRootPath}
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
