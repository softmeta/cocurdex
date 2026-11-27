import type { MessageAttachment } from "@cocurdex/shared";
import { useAtomValue } from "jotai";
import { type MouseEvent, type ReactNode, type Ref, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AppearanceSettings } from "@/features/settings";
import { cn } from "@/lib";
import { AppRail } from "../app-rail";
import { activeAppAtom } from "../app-rail/app-rail-store";
import {
  useAppSidebarCollapsed,
  useToggleAppSidebar,
} from "../app-rail/app-sidebar-store";
import { ChatDock } from "../chat-dock";
import { ChatDockActions } from "../chat-dock-actions";
import {
  type ChatDockVisibility,
  closedChatDockVisibility,
  type useDockGeometry,
} from "../chat-dock-geometry";
import { ChatDockLauncher } from "../chat-dock-launcher";
import { resolveChatDockPinLayout } from "../chat-dock-sizing";
import { DetachedChatPlaceholder, useChatWindowActions } from "../chat-window";
import { NavigationButtons } from "../navigation";
import { RightEditorPanel } from "../right-editor-panel-lazy";
import {
  appWorkbenchShownAtom,
  rightPanelDockedAtom,
  rightPanelResolvedActiveViewAtom,
} from "../right-editor-panel-store";
import { SearchPaletteButton } from "../search-palette";
import { LeftSidebar, ResizableSidebarSlot, ResizeSeparator } from "../sidebar";
import { useChatDockViewportWidth } from "../use-chat-dock-viewport";
import { MIN_CHAT_WIDTH, PANEL_SEPARATOR_WIDTH } from "./panel-geometry";

interface AppShellContentProps {
  contentRowRef: Ref<HTMLElement>;
  dock: ReturnType<typeof useDockGeometry>;
  isLeftSidebarOpen: boolean;
  leftWidth: number;
  isRightPanelOpen: boolean;
  isRightPanelMaximized: boolean;
  isPanelFullWidth: boolean;
  isRightPanelCompact: boolean;
  rightPanelActions: ReactNode;
  rightWidth: number;
  appearanceSettings: AppearanceSettings;
  splitChatNode: ReactNode;
  chatDockVisibility: ChatDockVisibility;
  isChatDockPinned: boolean;
  hideFabWhenClosed: boolean;
  onResizeHandleMouseDown(target: "left" | "right", event: MouseEvent): void;
  onToggleLeftSidebar(): void;
  onToggleRightPanel(): void;
  onAddContextToChat(attachment: MessageAttachment): boolean;
  onInsertTextToChat(text: string): boolean;
  onChatDockVisibilityChange(visibility: ChatDockVisibility): void;
  onChatDockPinnedChange(pinned: boolean): void;
}

export function AppShellContent({
  contentRowRef,
  dock,
  isLeftSidebarOpen,
  leftWidth,
  isRightPanelOpen,
  isRightPanelMaximized,
  isPanelFullWidth,
  isRightPanelCompact,
  rightPanelActions,
  rightWidth,
  appearanceSettings,
  splitChatNode,
  chatDockVisibility,
  isChatDockPinned,
  hideFabWhenClosed,
  onResizeHandleMouseDown,
  onToggleLeftSidebar,
  onToggleRightPanel,
  onAddContextToChat,
  onInsertTextToChat,
  onChatDockVisibilityChange,
  onChatDockPinnedChange,
}: AppShellContentProps) {
  const {
    detached,
    transferring: busy,
    toggleVisibility,
  } = useChatWindowActions();
  const dockViewportWidth = useChatDockViewportWidth();
  const pinLayout = resolveChatDockPinLayout(
    dockViewportWidth,
    dock.geometry.width,
  );
  const compactChatOpen = chatDockVisibility === "open";
  const isCompact = isRightPanelCompact && !isRightPanelMaximized;
  const { t } = useTranslation("editor");
  const isRightPanelDocked = useAtomValue(rightPanelDockedAtom);
  const rightPanelView = useAtomValue(rightPanelResolvedActiveViewAtom);
  const chatOverlayInset =
    isRightPanelOpen && !isPanelFullWidth
      ? rightWidth + PANEL_SEPARATOR_WIDTH
      : 0;
  const slideInOverview = !isPanelFullWidth && rightPanelView === "overview";
  const chatInset = slideInOverview
    ? `calc(${chatOverlayInset}px * var(--shell-panel-open-progress, 1))`
    : `${chatOverlayInset}px`;
  const editorOverlayInset =
    !detached &&
    isRightPanelMaximized &&
    compactChatOpen &&
    isChatDockPinned &&
    pinLayout.canPin
      ? pinLayout.width
      : 0;
  const isChatSurfaceShown = !(
    isRightPanelMaximized ||
    (detached && isRightPanelOpen)
  );
  const activeApp = useAtomValue(activeAppAtom);
  const isAppSidebarCollapsed = useAppSidebarCollapsed(activeApp);
  const toggleAppSidebar = useToggleAppSidebar();
  let railSidebarToggle: { open: boolean; onToggle(): void } | null = null;
  if (activeApp) {
    railSidebarToggle = {
      open: !isAppSidebarCollapsed,
      onToggle: () => toggleAppSidebar(activeApp),
    };
  } else if (isChatSurfaceShown && !isPanelFullWidth) {
    railSidebarToggle = {
      open: isLeftSidebarOpen,
      onToggle: onToggleLeftSidebar,
    };
  }
  const isContentBesideSidebar = isLeftSidebarOpen && !isCompact;
  const isAppWorkbenchShown = useAtomValue(appWorkbenchShownAtom);
  const isSidebarBesideRail = isAppWorkbenchShown
    ? !isAppSidebarCollapsed
    : isLeftSidebarOpen &&
      isChatSurfaceShown &&
      !isPanelFullWidth &&
      !isCompact;
  const isPanelOpening = usePanelOpeningMotion(
    isRightPanelOpen,
    isPanelFullWidth,
  );
  return (
    <main
      className={cn(
        "relative flex min-h-0 flex-1 overflow-hidden bg-shell",
        isPanelOpening && "shell-panel-opening",
      )}
      ref={contentRowRef}
    >
      <AppRail
        besideSidebar={isSidebarBesideRail}
        sidebarToggle={railSidebarToggle}
      />
      {isRightPanelOpen ? (
        <div
          data-testid="shell-right-panel"
          data-window-content={isAppWorkbenchShown ? undefined : ""}
          className={cn(
            "flex min-w-0 overflow-hidden",
            !isAppWorkbenchShown && "bg-app",
            isPanelFullWidth
              ? "flex-1"
              : "absolute inset-y-0 end-0 z-40 max-w-full",
            slideInOverview && "assistant-overview-slide-in",
          )}
          style={
            isPanelFullWidth
              ? { paddingInlineEnd: editorOverlayInset }
              : { width: rightWidth + PANEL_SEPARATOR_WIDTH }
          }
        >
          {isPanelFullWidth ? null : (
            <ResizeSeparator
              ariaLabel={t("actions.resizeEditorPanel")}
              testId="panel-separator"
              onMouseDown={(event) => onResizeHandleMouseDown("right", event)}
            />
          )}
          <div className="min-w-0 flex-1 overflow-hidden">
            <RightEditorPanel
              onClose={onToggleRightPanel}
              appearanceSettings={appearanceSettings}
              onAddContextToChat={onAddContextToChat}
              onInsertTextToChat={onInsertTextToChat}
              overlayInset={editorOverlayInset}
              reserveTrafficLights={isPanelFullWidth}
              viewSwitcherLeading={
                isPanelFullWidth ? (
                  <>
                    <NavigationButtons />
                    <SearchPaletteButton />
                  </>
                ) : null
              }
              viewSwitcherTrailing={rightPanelActions}
            />
          </div>
        </div>
      ) : null}
      {isChatSurfaceShown ? (
        <div
          className={cn(
            "flex min-w-0 overflow-hidden",
            isCompact ? "shrink-0" : "flex-1",
            isCompact &&
              "app-no-drag absolute end-2 top-10 bottom-2 z-50 rounded-panel bg-chat-canvas shadow-overlay ring-1 ring-menu-ring",
            isCompact && !compactChatOpen && "invisible pointer-events-none",
          )}
          inert={busy || (isCompact && !compactChatOpen)}
          data-testid="shell-chat-surface"
          style={{
            width: isCompact ? MIN_CHAT_WIDTH + 2 : undefined,
            paddingInlineEnd: chatInset,
          }}
        >
          <ResizableSidebarSlot
            isOpen={isLeftSidebarOpen}
            separatorAriaLabel={t("actions.resizeSidebar")}
            width={leftWidth}
            onResizeMouseDown={(event) =>
              onResizeHandleMouseDown("left", event)
            }
          >
            <LeftSidebar showFooter />
          </ResizableSidebarSlot>
          <div
            className={cn(
              "flex min-w-0 flex-1",
              isContentBesideSidebar && "bg-sidebar",
            )}
            data-window-sidebar-edge={isContentBesideSidebar ? "" : undefined}
          >
            <div
              className={cn(
                "min-w-0 flex-1 overflow-x-auto overflow-y-hidden bg-app",
                isContentBesideSidebar && "rounded-s-card",
              )}
              data-window-content={isCompact ? undefined : ""}
            >
              <div
                className="h-full"
                style={
                  chatOverlayInset && !isRightPanelDocked
                    ? { minWidth: `calc(100% + ${chatInset})` }
                    : undefined
                }
              >
                {detached ? <DetachedChatPlaceholder /> : splitChatNode}
              </div>
            </div>
          </div>
          {isCompact && compactChatOpen ? (
            <div className="absolute top-1 end-1 z-50 bg-chat-canvas">
              <ChatDockActions
                pinned={isChatDockPinned}
                onPinnedChange={onChatDockPinnedChange}
                onClose={() =>
                  onChatDockVisibilityChange(
                    closedChatDockVisibility(hideFabWhenClosed),
                  )
                }
              />
            </div>
          ) : null}
        </div>
      ) : null}
      {detached && chatDockVisibility !== "hidden" ? (
        <ChatDockLauncher
          detached
          onOpen={toggleVisibility}
          onHideFab={() => onChatDockVisibilityChange("hidden")}
        />
      ) : null}
      {!detached && isCompact && chatDockVisibility === "collapsed" ? (
        <ChatDockLauncher
          onOpen={() => onChatDockVisibilityChange("open")}
          onHideFab={() => onChatDockVisibilityChange("hidden")}
        />
      ) : null}
      {!detached && isRightPanelMaximized ? (
        <ChatDock
          visibility={chatDockVisibility}
          pinned={isChatDockPinned}
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
          <div className="h-full" inert={busy}>
            {chatDockVisibility === "open" ? splitChatNode : null}
          </div>
        </ChatDock>
      ) : null}
    </main>
  );
}

function usePanelOpeningMotion(isOpen: boolean, isFullWidth: boolean) {
  const [motion, setMotion] = useState({
    isOpen,
    isFullWidth,
    isOpening: isOpen && !isFullWidth,
  });
  if (motion.isOpen !== isOpen || motion.isFullWidth !== isFullWidth) {
    setMotion({
      isOpen,
      isFullWidth,
      isOpening: isOpen && !isFullWidth && (motion.isOpening || !motion.isOpen),
    });
  }
  return motion.isOpening;
}
