import { useAtomValue } from "jotai";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ResizeSeparator } from "@/components/resize-separator";
import { focusedSessionPaneAtom, sessionsAtom } from "@/features/sessions";
import { cn } from "@/lib";
import { ChatDockActions } from "./chat-dock-actions";
import {
  type ChatDockVisibility,
  type useDockGeometry,
  useSessionListWidth,
} from "./chat-dock-geometry";
import { ChatDockLauncher } from "./chat-dock-launcher";
import { resolveChatDockPinLayout } from "./chat-dock-sizing";
import {
  SessionPaneHeader,
  sessionPaneTitle,
  useSessionSplitActions,
} from "./session-split";
import { LeftSidebar } from "./sidebar";
import { SidebarToggleButton } from "./titlebar-icon-button";
import { useChatDockViewportWidth } from "./use-chat-dock-viewport";
import {
  VIEW_SWITCHER_ROW_HEIGHT_PX,
  VIEW_SWITCHER_ROW_OUTER_HEIGHT_PX,
} from "./view-switcher-tabs";

interface ChatDockProps {
  visibility: ChatDockVisibility;
  pinned: boolean;
  pinnable?: boolean;
  dock: ReturnType<typeof useDockGeometry>;
  onOpen(): void;
  onClose(): void;
  onHideFab(): void;
  onPinnedChange(pinned: boolean): void;
  children: ReactNode;
}

export function ChatDock({
  visibility,
  pinned: pinRequested,
  pinnable = true,
  dock,
  onOpen,
  onClose,
  onHideFab,
  onPinnedChange,
  children,
}: ChatDockProps) {
  const { t } = useTranslation("editor");
  const { geometry, beginDrag, beginResize, beginPinnedResize } = dock;
  const { width: sessionListWidth, beginResize: beginSessionListResize } =
    useSessionListWidth(geometry.width);
  const [sessionListOpen, setSessionListOpen] = useState(false);

  const viewportWidth = useChatDockViewportWidth();
  const pinLayout = resolveChatDockPinLayout(viewportWidth, geometry.width);
  const pinned = pinnable && pinRequested && pinLayout.canPin;
  const { paneCount, focusedPaneId, splitPaneById } = useSessionSplitActions();
  const focusedPane = useAtomValue(focusedSessionPaneAtom);
  const sessions = useAtomValue(sessionsAtom);
  const paneTitle = sessionPaneTitle(focusedPane, sessions);
  const singlePane = paneCount === 1;

  if (visibility === "hidden") {
    return null;
  }

  if (visibility === "collapsed") {
    return <ChatDockLauncher onOpen={onOpen} onHideFab={onHideFab} />;
  }

  const sessionToggle = (
    <SidebarToggleButton
      label={t("actions.toggleChatSessions")}
      open={sessionListOpen}
      onToggle={() => setSessionListOpen((prev) => !prev)}
      onMouseDown={(event) => event.stopPropagation()}
    />
  );

  const headerTrailing = (
    <ChatDockActions
      pinnable={pinnable}
      pinned={pinRequested}
      onPinnedChange={onPinnedChange}
      onClose={onClose}
    />
  );

  const sessionListDrawer = sessionListOpen ? (
    <>
      <button
        aria-label={t("actions.closeChatSessions")}
        className="absolute inset-y-0 end-0 z-10 cursor-default"
        onClick={() => setSessionListOpen(false)}
        style={{ insetInlineStart: sessionListWidth }}
        type="button"
      />
      <div
        className="absolute inset-y-0 start-0 z-20"
        style={{ width: sessionListWidth }}
      >
        <LeftSidebar
          headerStart={
            <div className="flex items-center py-1">{sessionToggle}</div>
          }
          hideTitlebarSpacer
          onAfterNavigate={() => setSessionListOpen(false)}
        />
        <ResizeSeparator
          ariaLabel={t("actions.resizeSessionList")}
          className="z-30"
          position="absolute-end"
          onMouseDown={beginSessionListResize}
        />
      </div>
    </>
  ) : null;

  const actionHeader = (options?: { draggable?: boolean }) => {
    const drawerOpen = sessionListOpen;
    const canDrag = !!options?.draggable && !drawerOpen;
    const leading = drawerOpen ? (
      <div
        aria-hidden
        className="shrink-0"
        style={{ width: sessionListWidth }}
      />
    ) : (
      <div className="flex shrink-0 items-center">{sessionToggle}</div>
    );
    const handleRowMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
      if (!canDrag || (event.target as HTMLElement).closest("button")) {
        return;
      }
      beginDrag(event);
    };

    if (singlePane) {
      return (
        // biome-ignore lint/a11y/noStaticElementInteractions: floating dock drag handle
        <div
          className={cn(
            "relative z-30 shrink-0",
            drawerOpen && "pointer-events-none [&_button]:pointer-events-auto",
            canDrag && "cursor-move",
          )}
          onMouseDown={handleRowMouseDown}
        >
          <SessionPaneHeader
            canClose={false}
            className="bg-transparent pe-3"
            isFocused
            leading={leading}
            paneId={focusedPaneId}
            sessionId={focusedPane?.sessionId}
            title={paneTitle}
            trailing={headerTrailing}
            onSplitDown={() => splitPaneById(focusedPaneId, "down")}
            onSplitRight={() => splitPaneById(focusedPaneId, "right")}
          />
        </div>
      );
    }

    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: floating dock drag handle
      <div
        className={cn(
          "relative z-30 flex shrink-0 items-center py-1 pe-3",
          drawerOpen && "pointer-events-none",
          canDrag && "cursor-move",
        )}
        onMouseDown={handleRowMouseDown}
      >
        {leading}
        {/*
          biome-ignore lint/a11y/noStaticElementInteractions: drag strip while
          the drawer is open (parent is pe-none, so this must own beginDrag).
        */}
        <div
          className={cn(
            "min-w-0 flex-1 self-stretch",
            drawerOpen && canDrag && "pointer-events-auto cursor-move",
          )}
          onMouseDown={drawerOpen && canDrag ? beginDrag : undefined}
        />
        <div className={cn(drawerOpen && "pointer-events-auto")}>
          {headerTrailing}
        </div>
      </div>
    );
  };

  return (
    <div
      className={cn(
        "pointer-events-none absolute z-40",
        pinned ? "inset-y-0 end-0" : "inset-0",
      )}
      style={pinned ? { width: pinLayout.width } : undefined}
    >
      {pinned ? (
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 box-content border-b border-editor-border"
          style={{ height: VIEW_SWITCHER_ROW_HEIGHT_PX }}
        />
      ) : null}
      <div
        className={cn(
          "pointer-events-auto flex flex-col overflow-hidden bg-chat-canvas",
          pinned
            ? "absolute inset-x-0 bottom-0"
            : "absolute rounded-panel shadow-overlay ring-1 ring-menu-ring",
        )}
        style={
          pinned
            ? { top: VIEW_SWITCHER_ROW_OUTER_HEIGHT_PX }
            : {
                right: geometry.right,
                bottom: geometry.bottom,
                width: geometry.width,
                height: geometry.height,
              }
        }
      >
        {pinned ? (
          <ResizeSeparator
            ariaLabel={t("actions.resizeChat")}
            className="z-40"
            position="absolute-start"
            onMouseDown={beginPinnedResize}
          />
        ) : (
          <button
            aria-label={t("actions.resizeChat")}
            className="absolute top-0 left-0 z-40 size-4 cursor-nwse-resize"
            onMouseDown={beginResize}
            type="button"
          />
        )}

        <div className="relative flex min-h-0 flex-1 flex-col bg-chat-canvas">
          {actionHeader({ draggable: !pinned })}
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {children}
          </div>
          {sessionListDrawer}
        </div>
      </div>
    </div>
  );
}
