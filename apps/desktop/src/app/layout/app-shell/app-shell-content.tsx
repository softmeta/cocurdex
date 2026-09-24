import type { MessageAttachment } from "@cocurdex/shared";
import type { MouseEvent, ReactNode, Ref } from "react";
import type { AppearanceSettings } from "@/features/settings";
import { cn } from "@/lib";
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
import { RightEditorPanel } from "../right-editor-panel";
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
  rightWidth: number;
  appearanceSettings: AppearanceSettings;
  splitChatNode: ReactNode;
  chatDockVisibility: ChatDockVisibility;
  isChatDockPinned: boolean;
  hideFabWhenClosed: boolean;
  onResizeHandleMouseDown(target: "left" | "right", event: MouseEvent): void;
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
  rightWidth,
  appearanceSettings,
  splitChatNode,
  chatDockVisibility,
  isChatDockPinned,
  hideFabWhenClosed,
  onResizeHandleMouseDown,
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
  const chatOverlayInset =
    isRightPanelOpen && !isPanelFullWidth
      ? rightWidth + PANEL_SEPARATOR_WIDTH
      : 0;
  const editorOverlayInset =
    !detached &&
    isRightPanelMaximized &&
    compactChatOpen &&
    isChatDockPinned &&
    pinLayout.canPin
      ? pinLayout.width
      : 0;
  return (
    <main
      className="relative flex min-h-0 flex-1 overflow-hidden bg-app"
      ref={contentRowRef}
    >
      {isRightPanelOpen ? (
        <div
          data-testid="shell-right-panel"
          className={cn(
            "flex min-w-0 overflow-hidden bg-app",
            isPanelFullWidth
              ? "flex-1"
              : "absolute inset-y-0 end-0 z-40 max-w-full",
          )}
          style={
            isPanelFullWidth
              ? { paddingInlineEnd: editorOverlayInset }
              : { width: rightWidth + PANEL_SEPARATOR_WIDTH }
          }
        >
          {isPanelFullWidth ? null : (
            <ResizeSeparator
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
            />
          </div>
        </div>
      ) : null}
      {isRightPanelMaximized || (detached && isRightPanelOpen) ? null : (
        <div
          className={cn(
            "flex min-w-0 shrink-0 overflow-hidden",
            isCompact &&
              "app-no-drag absolute end-2 top-10 bottom-2 z-50 rounded-panel border border-border bg-chat-canvas shadow-2xl",
            isCompact && !compactChatOpen && "invisible pointer-events-none",
          )}
          inert={busy || (isCompact && !compactChatOpen)}
          data-testid="shell-chat-surface"
          style={{
            width: isCompact ? MIN_CHAT_WIDTH + 2 : "100%",
            paddingInlineEnd: chatOverlayInset,
          }}
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
          <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
            <div
              className="h-full"
              style={
                chatOverlayInset
                  ? { minWidth: `calc(100% + ${chatOverlayInset}px)` }
                  : undefined
              }
            >
              {detached ? <DetachedChatPlaceholder /> : splitChatNode}
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
      )}
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
