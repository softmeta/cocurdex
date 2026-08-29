import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { isAnnotationModeAtom } from "@/features/browser";
import { useChatEventBridge } from "@/features/chat";
import {
  editorPanelOpenAtom,
  openFileAtom,
  rightPanelResizingAtom,
} from "@/features/editor";
import {
  type AppearanceSettings,
  getStoredAppearanceSettings,
  getStoredNotificationSettings,
  getStoredThemeMode,
  type NotificationSettings,
  registerOpenSettingsHandler,
  type ThemeMode,
  useCompletionNotifier,
} from "@/features/settings";
import { useAppShortcuts } from "@/features/shortcuts";
import { activeWorkspaceIdAtom, workspacesAtom } from "@/features/workspaces";
import {
  getStoredLanguageMode,
  type LanguageMode,
  type SupportedLocale,
} from "@/i18n/language";
import type { WorkspaceFileEntry } from "@/lib";
import { desktopApi, useMountEffect } from "@/lib";
import {
  type ChatDockVisibility,
  getStoredChatDockVisibility,
  getStoredHideFabWhenClosed,
  nextChatDockVisibilityOnToggle,
  persistChatDockVisibility,
  persistHideFabWhenClosed,
  resolveChatDockVisibilityAfterHideFabChange,
} from "../chat-dock-geometry";
import {
  type ChatLayoutApplySource,
  type ChatLayoutMode,
  getStoredChatLayoutMode,
  getStoredLastDockLayout,
  isEditorFullscreenLayout,
  isPinnedChatLayout,
  persistChatLayoutMode,
  shouldOpenDockWhenApplyingLayout,
} from "../chat-layout-preference";
import { useAgentEventBridge, useBrowserEventBridge } from "./app-shell-events";
import { AppShellFrame } from "./app-shell-frame";
import { resolveRightPanelVisibility } from "./app-shell-layout";
import { useAppPersistence } from "./app-shell-persistence";
import {
  persistNotificationSettings,
  syncAppearanceSettings,
  syncInitialPreferences,
  syncLanguageMode,
  syncThemeMode,
} from "./app-shell-preferences";
import {
  LEFT_SIDEBAR_COLLAPSE_WIDTH,
  RIGHT_PANEL_COLLAPSE_WIDTH,
  useAppShellResize,
} from "./app-shell-resize";
import type { AppScreen, SettingsSectionId } from "./app-shell-types";
import { useSystemLocale, useSystemPrefersDark } from "./use-system-prefs";

syncInitialPreferences();

export function AppShell() {
  const { t } = useTranslation(["editor", "search"]);
  // Browser-style screen history so the titlebar back/forward arrows can move
  // between the app and settings screens.
  const [screenHistory, setScreenHistory] = useState<AppScreen[]>(["app"]);
  const [screenIndex, setScreenIndex] = useState(0);
  const activeScreen = screenHistory[screenIndex];
  const canGoBack = screenIndex > 0;
  const canGoForward = screenIndex < screenHistory.length - 1;
  // First sidebar item (常规 / General); deep links may override via openSettings.
  const [activeSettingsSection, setActiveSettingsSection] =
    useState<SettingsSectionId>("general");
  const [themeMode, setThemeMode] = useState<ThemeMode>(getStoredThemeMode);
  const [appearanceSettings, setAppearanceSettings] =
    useState<AppearanceSettings>(getStoredAppearanceSettings);
  const [languageMode, setLanguageMode] = useState<LanguageMode>(
    getStoredLanguageMode,
  );
  const [notificationSettings, setNotificationSettings] =
    useState<NotificationSettings>(getStoredNotificationSettings);
  const themeModeRef = useRef(themeMode);
  const languageModeRef = useRef(languageMode);
  // Stable callbacks (refs + module-level sync fns only) so the hooks don't
  // re-subscribe their matchMedia / languagechange listeners every render.
  const handleSystemPrefersDark = useCallback((nextPrefersDark: boolean) => {
    if (themeModeRef.current === "system") {
      syncThemeMode("system", nextPrefersDark);
    }
  }, []);
  const handleSystemLocale = useCallback(
    (nextSystemLocale: SupportedLocale) => {
      if (languageModeRef.current === "system") {
        syncLanguageMode("system", nextSystemLocale);
      }
    },
    [],
  );
  const prefersDark = useSystemPrefersDark(handleSystemPrefersDark);
  const systemLocale = useSystemLocale(
    languageMode === "system",
    handleSystemLocale,
  );
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  // Preferred chat layout (center | float | pinned). Restored on startup and
  // kept in sync when the user maximises, pins, or changes Settings.
  const [chatLayoutMode, setChatLayoutMode] = useState(getStoredChatLayoutMode);
  const isRightPanelMaximized = isEditorFullscreenLayout(chatLayoutMode);
  const isChatDockPinned = isPinnedChatLayout(chatLayoutMode);
  const [isRightPanelOpen, setIsRightPanelOpen] = useAtom(editorPanelOpenAtom);
  // Floating/pinned dock surface: open | collapsed (FAB) | hidden.
  // Restore the last surface across restarts (including collapsed FAB / fully
  // hidden). Layout mode alone must not force the dock open on cold start.
  const [chatDockVisibility, setChatDockVisibility] =
    useState<ChatDockVisibility>(getStoredChatDockVisibility);
  const [hideFabWhenClosed, setHideFabWhenClosed] = useState(
    getStoredHideFabWhenClosed,
  );
  // Restore editor panel when a fullscreen chat layout was saved last session.
  // Do not touch chatDockVisibility — open/collapsed/hidden is already restored.
  useMountEffect(() => {
    if (isEditorFullscreenLayout(getStoredChatLayoutMode())) {
      setIsRightPanelOpen(true);
    }
  });
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const openFile = useSetAtom(openFileAtom);
  const setRightPanelResizing = useSetAtom(rightPanelResizingAtom);
  const {
    contentRowCallbackRef,
    contentWidth,
    effectiveLeftWidthRef,
    effectiveRightWidthRef,
    handleResizeMouseDown,
    leftWidth,
    restoreLeftWidth,
    restoreRightWidth,
    rightWidth,
  } = useAppShellResize({
    isLeftSidebarOpen,
    isRightPanelOpen,
    setRightPanelResizing,
  });
  const workspaces = useAtomValue(workspacesAtom);
  const activeWorkspaceId = useAtomValue(activeWorkspaceIdAtom);
  const setIsAnnotationMode = useSetAtom(isAnnotationModeAtom);
  const canShowLeftSidebar = contentWidth >= LEFT_SIDEBAR_COLLAPSE_WIDTH;
  const canSplitRightPanel = contentWidth >= RIGHT_PANEL_COLLAPSE_WIDTH;
  // In global mode the right panel fills the window, so the left sidebar and
  // its width reservation collapse regardless of its own open state. When the
  // window is too narrow to split, opening the panel forces global so the
  // toggle still does something instead of silently rendering nothing.
  const { shouldShow: shouldShowRightPanel, isGlobal: isRightPanelGlobal } =
    resolveRightPanelVisibility({
      isOpen: isRightPanelOpen,
      isMaximized: isRightPanelMaximized,
      canSplit: canSplitRightPanel,
    });
  const shouldShowLeftSidebar =
    isLeftSidebarOpen && canShowLeftSidebar && !isRightPanelGlobal;
  const effectiveLeftWidth = shouldShowLeftSidebar ? leftWidth : 0;
  const effectiveRightWidth = shouldShowRightPanel ? rightWidth : 0;
  const isRightPanelOpenRef = useRef(isRightPanelOpen);
  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;
  themeModeRef.current = themeMode;
  languageModeRef.current = languageMode;
  effectiveLeftWidthRef.current = effectiveLeftWidth;
  effectiveRightWidthRef.current = effectiveRightWidth;
  isRightPanelOpenRef.current = isRightPanelOpen;

  useAgentEventBridge();
  useBrowserEventBridge();
  useChatEventBridge();
  useAppPersistence();
  useCompletionNotifier(notificationSettings);

  const toggleLeftSidebar = () => {
    if (isLeftSidebarOpen) {
      setIsLeftSidebarOpen(false);
      return;
    }

    restoreLeftWidth(effectiveRightWidth);
    setIsLeftSidebarOpen(true);
  };

  const applyChatLayoutMode = useCallback(
    (mode: ChatLayoutMode, source: ChatLayoutApplySource = "settings") => {
      setChatLayoutMode(mode);
      persistChatLayoutMode(mode);
      if (!isEditorFullscreenLayout(mode)) {
        return;
      }
      setIsRightPanelOpen(true);
      // Maximize/pin keep a collapsed FAB; settings open the dock so the
      // chosen layout is visible. See shouldOpenDockWhenApplyingLayout.
      if (shouldOpenDockWhenApplyingLayout(mode, source)) {
        setChatDockVisibility("open");
        persistChatDockVisibility("open");
      }
    },
    [setIsRightPanelOpen],
  );

  const toggleRightPanel = () => {
    if (isRightPanelOpen) {
      setIsRightPanelOpen(false);
      // Leaving global mode behind so reopening starts in the split layout.
      applyChatLayoutMode("center", "panel-close");
      return;
    }

    restoreRightWidth(effectiveLeftWidth);
    setIsRightPanelOpen(true);
  };

  const toggleRightPanelMaximize = () => {
    if (isRightPanelMaximized) {
      applyChatLayoutMode("center", "maximize");
      return;
    }
    // Restore the last float/pinned choice from before the last center exit.
    // Do not force the dock open — keep a collapsed FAB if the user closed it.
    applyChatLayoutMode(getStoredLastDockLayout(), "maximize");
  };

  useAppShortcuts(
    {
      fileSearch: () => setIsSearchOpen(true),
      toggleLeftSidebar,
      toggleRightPanel,
      toggleEditorFullscreen: toggleRightPanelMaximize,
      toggleChatDock: () => {
        setChatDockVisibility((current) => {
          const next = nextChatDockVisibilityOnToggle(
            current,
            hideFabWhenClosed,
          );
          persistChatDockVisibility(next);
          return next;
        });
      },
      toggleDesignMode: () => {
        setIsAnnotationMode((prev) => {
          const next = !prev;
          void desktopApi.browserToggleAnnotationMode(next);
          return next;
        });
      },
    },
    {
      enabled: {
        fileSearch: () => activeScreen === "app",
        toggleLeftSidebar: () => activeScreen === "app",
        toggleRightPanel: () => activeScreen === "app",
        toggleEditorFullscreen: () => activeScreen === "app",
        // Editor fullscreen only — center layout already shows chat as a column.
        toggleChatDock: () => activeScreen === "app" && isRightPanelMaximized,
        toggleDesignMode: () => activeScreen === "app" && shouldShowRightPanel,
      },
      labels: {
        fileSearch: t("search:searchFiles"),
        toggleChatDock: t("editor:actions.toggleChat"),
      },
    },
  );

  const handleChatDockVisibilityChange = (visibility: ChatDockVisibility) => {
    setChatDockVisibility(visibility);
    persistChatDockVisibility(visibility);
  };

  const handleHideFabWhenClosedChange = (hide: boolean) => {
    setHideFabWhenClosed(hide);
    persistHideFabWhenClosed(hide);
    setChatDockVisibility((current) => {
      const next = resolveChatDockVisibilityAfterHideFabChange(current, hide);
      if (next !== current) {
        persistChatDockVisibility(next);
      }
      return next;
    });
  };

  const handleChatDockPinnedChange = (pinned: boolean) => {
    applyChatLayoutMode(pinned ? "pinned" : "float", "pin");
  };

  // Truncate any forward entries before pushing the new screen, mirroring
  // browser history semantics.
  const navigateToScreen = (screen: AppScreen) => {
    if (screen === activeScreen) {
      return;
    }
    setScreenHistory((prev) => [...prev.slice(0, screenIndex + 1), screen]);
    setScreenIndex((index) => index + 1);
  };

  const goBackScreen = () => {
    if (canGoBack) {
      setScreenIndex((index) => index - 1);
    }
  };

  const goForwardScreen = () => {
    if (canGoForward) {
      setScreenIndex((index) => index + 1);
    }
  };

  // Optional section: gear icon reopens the last section; empty states pass
  // "providers" (etc.) to land on the right pane. Guard with typeof so a
  // React click event is never treated as a section id (onClick={openSettings}).
  const openSettings = (section?: SettingsSectionId) => {
    setIsSearchOpen(false);
    if (typeof section === "string") {
      setActiveSettingsSection(section);
    }
    navigateToScreen("settings");
  };

  // Menus (e.g. provider model empty state) call openSettings() without
  // prop drilling through the composer tree.
  const openSettingsRef = useRef(openSettings);
  openSettingsRef.current = openSettings;
  useMountEffect(() =>
    registerOpenSettingsHandler((section) => {
      openSettingsRef.current(section);
    }),
  );

  const openFileFromPalette = (file: WorkspaceFileEntry) => {
    openFile(file.path);
    setIsSearchOpen(false);

    if (isRightPanelOpen) {
      return;
    }

    restoreRightWidth(effectiveLeftWidth);
    setIsRightPanelOpen(true);
  };

  const handleThemeModeChange = (nextThemeMode: ThemeMode) => {
    setThemeMode(nextThemeMode);
    syncThemeMode(nextThemeMode, prefersDark);
  };

  const handleAppearanceSettingsChange = (nextSettings: AppearanceSettings) => {
    setAppearanceSettings(nextSettings);
    syncAppearanceSettings(nextSettings);
  };

  const handleLanguageModeChange = (nextLanguageMode: LanguageMode) => {
    setLanguageMode(nextLanguageMode);
    syncLanguageMode(nextLanguageMode, systemLocale);
  };

  const handleNotificationSettingsChange = (
    nextSettings: NotificationSettings,
  ) => {
    setNotificationSettings(nextSettings);
    persistNotificationSettings(nextSettings);
  };

  return (
    <AppShellFrame
      activeScreen={activeScreen}
      activeSettingsSection={activeSettingsSection}
      activeWorkspaceRootPath={activeWorkspace?.rootPath ?? null}
      appearanceSettings={appearanceSettings}
      canGoBack={canGoBack}
      canGoForward={canGoForward}
      contentRowRef={contentRowCallbackRef}
      effectiveRightWidth={effectiveRightWidth}
      isLeftSidebarOpen={shouldShowLeftSidebar}
      isLeftSidebarPreferredOpen={isLeftSidebarOpen}
      isRightPanelOpen={shouldShowRightPanel}
      isRightPanelMaximized={isRightPanelGlobal}
      chatDockVisibility={chatDockVisibility}
      isChatDockPinned={isChatDockPinned}
      isSearchOpen={isSearchOpen}
      languageMode={languageMode}
      leftWidth={leftWidth}
      notificationSettings={notificationSettings}
      chatLayoutMode={chatLayoutMode}
      hideFabWhenClosed={hideFabWhenClosed}
      onGoBack={goBackScreen}
      onGoForward={goForwardScreen}
      onAppearanceSettingsChange={handleAppearanceSettingsChange}
      onChatLayoutModeChange={applyChatLayoutMode}
      onHideFabWhenClosedChange={handleHideFabWhenClosedChange}
      onLanguageModeChange={handleLanguageModeChange}
      onNotificationSettingsChange={handleNotificationSettingsChange}
      onOpenFileFromPalette={openFileFromPalette}
      onOpenSettings={openSettings}
      onResizeHandleMouseDown={handleResizeMouseDown}
      onSearchClose={() => setIsSearchOpen(false)}
      onSettingsSectionChange={setActiveSettingsSection}
      onThemeModeChange={handleThemeModeChange}
      onToggleLeftSidebar={toggleLeftSidebar}
      onToggleRightPanel={toggleRightPanel}
      onToggleRightPanelMaximize={toggleRightPanelMaximize}
      onChatDockVisibilityChange={handleChatDockVisibilityChange}
      onChatDockPinnedChange={handleChatDockPinnedChange}
      rightWidth={rightWidth}
      themeMode={themeMode}
    />
  );
}
