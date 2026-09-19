import type { MessageAttachment } from "@cocurdex/shared";
import type { MouseEvent, ReactNode, Ref } from "react";
import type { AppearanceSettings } from "@/features/settings";
import { cn } from "@/lib";
import { ChatDock } from "../chat-dock";
import { ChatDockActions } from "../chat-dock-actions";
import {
  type ChatDockVisibility,
  closedChatDockVisibility,
} from "../chat-dock-geometry";
import { ChatDockLauncher } from "../chat-dock-launcher";
import { DetachedChatPlaceholder, useChatWindowActions } from "../chat-window";
import { RightEditorPanel } from "../right-editor-panel";
import { LeftSidebar, ResizableSidebarSlot, ResizeSeparator } from "../sidebar";
import { MIN_CHAT_WIDTH } from "./panel-geometry";

interface AppShellContentProps {
  contentRowRef: Ref<HTMLElement>;
  isLeftSidebarOpen: boolean;
  leftWidth: number;
  isRightPanelOpen: boolean;
  isRightPanelMaximized: boolean;
  isRightPanelCompact: boolean;
  rightWidth: number;
  appearanceSettings: AppearanceSettings;
  chatNode: ReactNode;
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
  isLeftSidebarOpen,
  leftWidth,
  isRightPanelOpen,
  isRightPanelMaximized,
  isRightPanelCompact,
  rightWidth,
  appearanceSettings,
  chatNode,
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
  const compactChatOpen = chatDockVisibility === "open";
  const isCompact = isRightPanelCompact && !isRightPanelMaximized;
  const isPanelFullWidth = isRightPanelMaximized || isCompact || detached;
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
              : "absolute inset-y-0 end-0 z-40 max-w-full shadow-chat-panel",
          )}
          style={isPanelFullWidth ? undefined : { width: rightWidth + 1 }}
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
          style={{ width: isCompact ? MIN_CHAT_WIDTH + 2 : "100%" }}
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
          <div className="min-w-0 flex-1 overflow-hidden">
            {detached ? <DetachedChatPlaceholder /> : splitChatNode}
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
            {chatDockVisibility === "open" ? chatNode : null}
          </div>
        </ChatDock>
      ) : null}
    </main>
  );
}
