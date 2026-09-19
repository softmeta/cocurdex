import { useAtomValue } from "jotai";
import { PanelLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ResizeSeparator } from "@/components/resize-separator";
import { conversationsAtom } from "@/features/chat";
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
import {
  TITLEBAR_ICON_GLYPH_CLASS,
  TitlebarIconButton,
} from "./titlebar-icon-button";
import { useChatDockViewportWidth } from "./use-chat-dock-viewport";
import { VIEW_SWITCHER_ROW_HEIGHT_PX } from "./view-switcher-tabs";

interface ChatDockProps {
  visibility: ChatDockVisibility;
  /** Controlled pin state from the shell layout preference. */
  pinned: boolean;
  /** Geometry hoisted to the shell so it can reserve the pinned rail width. */
  dock: ReturnType<typeof useDockGeometry>;
  onOpen(): void;
  onClose(): void;
  onHideFab(): void;
  onPinnedChange(pinned: boolean): void;
  children: ReactNode;
}

/*
 * Chat surface used while the editor panel is fullscreen (center chat column
 * is hidden). Always an out-of-flow overlay so neither floating nor pinning
 * ever takes width from the editor/content area.
 *
 * - Hidden: nothing rendered; reopen via shortcut / layout actions.
 * - Collapsed: draggable FAB (absolute; position persisted separately from the
 *   open card). Click opens; drag past a small threshold repositions only.
 * - Open + floating (unpinned): overlay card at its persisted position/size.
 * - Open + pinned: full-height overlay rail flush to the trailing edge; it
 *   floats above the editor instead of shrinking it.
 *
 * The rail's top row is the session pane header: session-list toggle, the
 * session menu, the title, then the rail actions (same size-6 chrome icons and
 * 32px row as every other pane header, so titles and menus sit in one place
 * whichever layout the chat is in). With a split, the panes own their headers
 * and this row falls back to rail chrome only.
 *
 * Session list is a full-height left drawer (toggle row + list, one bg column)
 * with a drag handle on its trailing edge for width.
 *
 * Outer shell toggles flex participation; the inner surface keeps one DOM
 * tree so pin/unpin does not remount `children` (CenterPanel / composer).
 */
export function ChatDock({
  visibility,
  pinned: pinRequested,
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
  const pinned = pinRequested && pinLayout.canPin;
  const { paneCount, focusedPaneId, splitPaneById } = useSessionSplitActions();
  const focusedPane = useAtomValue(focusedSessionPaneAtom);
  const conversations = useAtomValue(conversationsAtom);
  const sessions = useAtomValue(sessionsAtom);
  const paneTitle = sessionPaneTitle(focusedPane, conversations, sessions);
  const singlePane = paneCount === 1;

  if (visibility === "hidden") {
    return null;
  }

  if (visibility === "collapsed") {
    return <ChatDockLauncher onOpen={onOpen} onHideFab={onHideFab} />;
  }

  // Session toggle must stay the same size as pin/close so opening the drawer
  // (toggle leaves the row for a width spacer) does not change row height.
  const sessionToggle = (
    <TitlebarIconButton
      active={sessionListOpen}
      aria-label={t("actions.toggleChatSessions")}
      onClick={() => setSessionListOpen((prev) => !prev)}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <PanelLeft className={TITLEBAR_ICON_GLYPH_CLASS} />
    </TitlebarIconButton>
  );

  const headerTrailing = (
    <ChatDockActions
      pinned={pinRequested}
      onPinnedChange={onPinnedChange}
      onClose={onClose}
    />
  );

  // Full-height LeftSidebar — same `bg-sidebar` token as the main shell rail.
  // Click-outside catcher covers only the trailing side of the drawer (no
  // scrim — a dim made the drawer look like a different surface).
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
            // Drawer open: parent pe-none so the left strip does not steal hits
            // from the session toggle / outside catcher underneath, while the
            // row's own buttons stay clickable.
            drawerOpen && "pointer-events-none [&_button]:pointer-events-auto",
            canDrag && "cursor-move",
          )}
          onMouseDown={handleRowMouseDown}
        >
          <SessionPaneHeader
            canClose={false}
            // pe-3 aligns the rail actions with the titlebar pills above;
            // transparent keeps the session drawer's own header row visible.
            className="bg-transparent pe-3"
            isFocused
            leading={leading}
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
          // pe-3 when pinned aligns close with the titlebar settings pill above.
          "relative z-30 flex shrink-0 items-center py-1 pe-3",
          // Drawer open: parent pe-none so the left strip does not steal hits from
          // the session toggle / outside catcher underneath. Drag + pin/close
          // re-enable pe on their own nodes (pe-none child does not punch a hole
          // through a pe-auto parent).
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
    // Outer: never a flex item. Pinned → full-height overlay flush to the
    // trailing edge; floating → positioned overlay card. Both leave the editor
    // flex sibling the whole row, so pinning never squeezes the content area.
    <div
      className={cn(
        "pointer-events-none absolute z-40",
        pinned ? "inset-y-0 end-0" : "inset-0",
      )}
      style={pinned ? { width: pinLayout.width } : undefined}
    >
      {pinned ? (
        // Continues ViewSwitcherTabs' border-b across the rail column while the
        // chat surface below stays clear of the header band.
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 border-b border-editor-border"
          style={{ height: VIEW_SWITCHER_ROW_HEIGHT_PX }}
        />
      ) : null}
      <div
        className={cn(
          "pointer-events-auto flex flex-col overflow-hidden bg-chat-canvas",
          pinned
            ? // Docked rail: same canvas plane as the editor, separated by the
              // leading divider below the header band.
              "absolute inset-x-0 bottom-0"
            : // Floating card is a self-contained surface (matches CenterPanel
              // canvas; bg-app is a different token in light mode).
              "absolute rounded-panel border border-border shadow-2xl",
        )}
        style={
          pinned
            ? { top: VIEW_SWITCHER_ROW_HEIGHT_PX }
            : {
                right: geometry.right,
                bottom: geometry.bottom,
                width: geometry.width,
                height: geometry.height,
              }
        }
      >
        {pinned ? (
          // z-40: above action header (z-30) and session-list drawer (z-20).
          <ResizeSeparator
            ariaLabel={t("actions.resizeChat")}
            className="z-40"
            position="absolute-start"
            onMouseDown={beginPinnedResize}
          />
        ) : (
          // Top-start corner grip. Must sit above the z-30 drag header or
          // mousedown is stolen for move-only and the card cannot be resized.
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
