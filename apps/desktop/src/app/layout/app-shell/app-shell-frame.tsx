import type { MessageAttachment } from "@cocurdex/shared";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import type { Ref } from "react";
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  editorPanelOpenAtom,
  setChatComposerAttachmentAtom,
} from "@/features/editor";
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
import {
  AssistantSuggestionBar,
  DeviceApprovalPrompt,
  SettingsScreen,
} from "@/features/settings";
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
import { ChatDock } from "../chat-dock";
import { CHAT_DOCK_ACTIONS_INSET } from "../chat-dock-actions";
import {
  type ChatDockVisibility,
  closedChatDockVisibility,
  useDockGeometry,
} from "../chat-dock-geometry";
import type { ChatLayoutMode } from "../chat-layout-preference";
import { useChatBrowserContext } from "../chat-window/chat-browser-context";
import { useChatContext } from "../chat-window/use-chat-context";
import { NavigationButtons } from "../navigation";
import { rightPanelResolvedActiveViewAtom } from "../right-editor-panel-store";
import {
  SearchPalette,
  SearchPaletteButton,
  useOpenEntityBridge,
} from "../search-palette";
import { SessionSplitLayout } from "../session-split";
import { SidebarToggleButton } from "../sidebar";
import { PersonaEditDialogHost } from "../sidebar/persona-edit-dialog-host";
import { sidebarTabAtom } from "../sidebar/sidebar-tab-store";
import { appBootstrappedAtom } from "./app-bootstrap-store";
import { AppShellContent } from "./app-shell-content";
import {
  TITLEBAR_HEIGHT,
  TITLEBAR_LEADING_RESERVE,
  TITLEBAR_PANE_HEADER_START_INSET,
  TITLEBAR_SIDEBAR_END_INSET,
  withTitlebarControlsInset,
} from "./app-shell-layout";
import { AppShellTitlebarActions } from "./app-shell-titlebar-actions";
import type { AppScreen, SettingsSectionId } from "./app-shell-types";
import { BootSplash } from "./boot-splash";
import { RightPanelWindowActions } from "./right-panel-window-actions";

interface AppShellFrameProps {
  activeScreen: AppScreen;
  activeSettingsSection: SettingsSectionId;
  activeWorkspaceRootPaths: string[];
  appearanceSettings: AppearanceSettings;
  contentRowRef: Ref<HTMLElement>;
  effectiveRightWidth: number;
  isLeftSidebarOpen: boolean;
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
  onCloseSettings(): void;
  onOpenFileFromPalette(file: WorkspaceFileEntry): void;
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
  onCloseSettings,
  onOpenFileFromPalette,
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
  const [sidebarTab, setSidebarTab] = useAtom(sidebarTabAtom);
  const isAssistantSidebar = sidebarTab === "personal";
  const providerModelsLoaded = useAtomValue(providerModelsLoadedAtom);
  const onboardingDismissed = useAtomValue(onboardingDismissedAtom);
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
  const composerRef = useChatContext(() => onChatDockVisibilityChange("open"));
  useChatBrowserContext();
  useOpenEntityBridge();
  const dock = useDockGeometry();
  const setRightPanelOpen = useSetAtom(editorPanelOpenAtom);
  const setRightPanelView = useSetAtom(rightPanelResolvedActiveViewAtom);
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

  let paneHeaderEndInset: number | string = 0;
  if (isRightPanelCompact && !isRightPanelMaximized) {
    paneHeaderEndInset = CHAT_DOCK_ACTIONS_INSET;
  } else if (!isRightPanelOpen) {
    paneHeaderEndInset = withTitlebarControlsInset(0);
  }
  const splitChatNode = (
    <SessionSplitLayout
      headerEndInset={paneHeaderEndInset}
      headerStartInset={
        !isLeftSidebarOpen && !isRightPanelCompact
          ? TITLEBAR_PANE_HEADER_START_INSET
          : 0
      }
      composerRef={composerRef}
      hideTitlebarSpacer={isRightPanelMaximized}
      hideSinglePaneHeader={isRightPanelMaximized}
      onOpenAssistantOverview={() => {
        setRightPanelView("overview");
        setRightPanelOpen(true);
      }}
    />
  );

  if (!appBootstrapped || onboardingNeeded === null) {
    return <BootSplash />;
  }

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
          "absolute inset-0",
          activeScreen === "app"
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0",
        )}
      >
        <div className="relative flex h-screen flex-col overflow-hidden bg-app text-app-foreground">
          <header
            className="absolute inset-x-0 top-0 z-30 flex select-none items-center"
            style={{ height: TITLEBAR_HEIGHT }}
          >
            <div
              className="app-drag flex h-full shrink-0 items-center"
              style={{
                width: isLeftSidebarOpen ? leftWidth : undefined,
                paddingInlineStart: TITLEBAR_LEADING_RESERVE,
                paddingInlineEnd: isLeftSidebarOpen
                  ? TITLEBAR_SIDEBAR_END_INSET
                  : undefined,
              }}
            >
              <div
                className={cn(
                  "app-no-drag min-w-0 flex-1 items-center gap-1",
                  isPanelFullWidth ? "hidden" : "flex",
                )}
              >
                <SidebarToggleButton
                  label={t("editor:actions.toggleSidebar")}
                  open={isLeftSidebarOpen}
                  onToggle={onToggleLeftSidebar}
                />
                <AppShellTitlebarActions
                  isChatDetached={isChatDetached}
                  isRightPanelOpen={isRightPanelOpen}
                  onToggleRightPanel={onToggleRightPanel}
                />
                <div className="ms-auto flex items-center gap-1">
                  {isAssistantSidebar ? null : <NavigationButtons />}
                  <SearchPaletteButton />
                </div>
              </div>
            </div>

            <div
              className="app-drag min-w-0 flex-1 self-stretch"
              data-testid="titlebar-drag-region"
            />

            <div
              className="app-drag flex h-full shrink-0 items-center justify-end px-3"
              style={{
                width: isRightPanelOpen ? effectiveRightWidth : undefined,
              }}
            />
          </header>

          <AppShellContent
            isRightPanelCompact={isRightPanelCompact}
            rightPanelActions={
              isChatDetached ? null : (
                <RightPanelWindowActions
                  isRightPanelMaximized={isRightPanelMaximized}
                  onToggleRightPanelMaximize={onToggleRightPanelMaximize}
                  onCloseRightPanel={onToggleRightPanel}
                />
              )
            }
            contentRowRef={contentRowRef}
            dock={dock}
            isLeftSidebarOpen={isLeftSidebarOpen}
            leftWidth={leftWidth}
            isRightPanelOpen={isRightPanelOpen}
            isRightPanelMaximized={isRightPanelMaximized}
            isPanelFullWidth={isPanelFullWidth}
            rightWidth={rightWidth}
            appearanceSettings={appearanceSettings}
            splitChatNode={activeScreen === "settings" ? null : splitChatNode}
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
        <DeviceApprovalPrompt />
        <PersonaEditDialogHost />
      </div>

      {activeScreen === "settings" ? (
        <div className="absolute inset-0">
          <SettingsScreen
            activeSection={activeSettingsSection}
            appearanceSettings={appearanceSettings}
            chatLayoutMode={chatLayoutMode}
            hideFabWhenClosed={hideFabWhenClosed}
            isSidebarOpen={isLeftSidebarPreferredOpen}
            sidebarWidth={leftWidth}
            historyControls={<NavigationButtons />}
            onBackToApp={onCloseSettings}
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
      {activeScreen === "settings" && !isChatDetached ? (
        <ChatDock
          visibility={chatDockVisibility}
          pinned={false}
          pinnable={false}
          dock={dock}
          onOpen={() => onChatDockVisibilityChange("open")}
          onClose={() =>
            onChatDockVisibilityChange(
              closedChatDockVisibility(hideFabWhenClosed),
            )
          }
          onHideFab={() => onChatDockVisibilityChange("hidden")}
          onPinnedChange={onChatDockPinnedChange}
        >
          <div className="flex h-full flex-col">
            <AssistantSuggestionBar section={activeSettingsSection} />
            <div className="min-h-0 flex-1">
              {chatDockVisibility === "open" ? (
                <SessionSplitLayout
                  composerRef={composerRef}
                  hideTitlebarSpacer
                  hideSinglePaneHeader
                />
              ) : null}
            </div>
          </div>
        </ChatDock>
      ) : null}
    </div>
  );
}
