import { MessageSquare, PanelLeft, Pin, PinOff, X } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ResizeSeparator } from "@/components/resize-separator";
import { IconButton } from "@/components/ui/icon-button";
import { useResolvedShortcutLabel } from "@/features/shortcuts";
import { cn } from "@/lib";
import { TITLEBAR_EDITOR_TOGGLE_WIDTH } from "./app-shell/app-shell-layout";
import {
  type ChatDockVisibility,
  useDockGeometry,
  useFabPosition,
  useSessionListWidth,
} from "./chat-dock-geometry";
import { LeftSidebar } from "./sidebar";
import {
  TITLEBAR_ICON_GLYPH_CLASS,
  TitlebarIconButton,
} from "./titlebar-icon-button";
import { VIEW_SWITCHER_ROW_HEIGHT_PX } from "./view-switcher-tabs";

interface ChatDockProps {
  visibility: ChatDockVisibility;
  /** Controlled pin state from the shell layout preference. */
  pinned: boolean;
  onOpen(): void;
  onClose(): void;
  onHideFab(): void;
  onPinnedChange(pinned: boolean): void;
  children: ReactNode;
}

/*
 * Chat surface used while the editor panel is fullscreen (center chat column
 * is hidden). Must render as a child of the main flex row so pin mode can
 * participate in layout and squeeze the editor.
 *
 * - Hidden: nothing rendered; reopen via shortcut / layout actions.
 * - Collapsed: draggable FAB (absolute; position persisted separately from the
 *   open card). Click opens; drag past a small threshold repositions only.
 * - Open + floating (unpinned): out-of-flow overlay card; editor full width.
 * - Open + pinned: full-height right rail with fixed width (flex shrink-0);
 *   editor flex sibling shrinks. Unpinning drops the rail and restores width.
 *
 * Pinned top row mirrors ViewSwitcherTabs (fixed TITLEBAR_HEIGHT + border-b) so
 * the full-width chrome rule continues across the vertical split. That band has
 * no chat-canvas fill so the shell `bg-app` shows through under the titlebar;
 * `bg-chat-canvas` starts on the content column below. Actions sit on the row
 * below that rule — same size-6 chrome icons and py-1 in float mode.
 *
 * Session list is a full-height left drawer (toggle row + list, one bg column)
 * with a drag handle on its trailing edge for width.
 *
 * Outer shell toggles flex participation; the inner surface keeps one DOM
 * tree so pin/unpin does not remount `children` (CenterPanel / composer).
 */
export function ChatDock({
  visibility,
  pinned,
  onOpen,
  onClose,
  onHideFab,
  onPinnedChange,
  children,
}: ChatDockProps) {
  const { t } = useTranslation("editor");
  const toggleChatShortcut = useResolvedShortcutLabel("toggleChatDock");
  const { geometry, beginDrag, beginResize, beginPinnedResize } =
    useDockGeometry();
  const {
    position: fabPosition,
    beginDrag: beginFabDrag,
    consumeDragClick: consumeFabDragClick,
  } = useFabPosition();
  const { width: sessionListWidth, beginResize: beginSessionListResize } =
    useSessionListWidth(geometry.width);
  const [sessionListOpen, setSessionListOpen] = useState(false);

  const togglePinned = () => {
    onPinnedChange(!pinned);
  };

  if (visibility === "hidden") {
    return null;
  }

  if (visibility === "collapsed") {
    return (
      <div
        className="group/fab absolute z-40"
        style={{ right: fabPosition.right, bottom: fabPosition.bottom }}
      >
        <IconButton
          aria-label={t("actions.openChat")}
          className="cursor-grab rounded-full shadow-lg active:cursor-grabbing"
          onClick={() => {
            if (consumeFabDragClick()) {
              return;
            }
            onOpen();
          }}
          onMouseDown={beginFabDrag}
          size="lg"
          title={
            toggleChatShortcut
              ? t("actions.chatFabHint", { shortcut: toggleChatShortcut })
              : t("actions.openChat")
          }
          variant="default"
        >
          <MessageSquare className="size-4" />
        </IconButton>
        <button
          aria-label={t("actions.hideChatFab")}
          className="absolute -end-1 -top-1 z-10 flex size-4 items-center justify-center rounded-full border border-border bg-background text-muted-foreground opacity-0 shadow-sm outline-none transition-opacity pointer-events-none hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 group-hover/fab:pointer-events-auto group-hover/fab:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            onHideFab();
          }}
          title={
            toggleChatShortcut
              ? t("actions.hideChatFabHint", { shortcut: toggleChatShortcut })
              : t("actions.hideChatFab")
          }
          type="button"
        >
          <X className="size-3" />
        </button>
      </div>
    );
  }

  // Float and pinned share one action row: TitlebarIconButton (size-6) + py-1.
  // Session toggle must stay the same size as pin/close so opening the drawer
  // (toggle leaves the row for a width spacer) does not change header height.
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

  const pinToggle = (
    <TitlebarIconButton
      active={pinned}
      aria-label={
        pinned ? t("actions.unpinChatDock") : t("actions.pinChatDock")
      }
      onClick={togglePinned}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {pinned ? (
        <PinOff className={TITLEBAR_ICON_GLYPH_CLASS} />
      ) : (
        <Pin className={TITLEBAR_ICON_GLYPH_CLASS} />
      )}
    </TitlebarIconButton>
  );

  const closeButton = (
    <TitlebarIconButton
      aria-label={t("actions.closeChat")}
      onClick={onClose}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <X className={TITLEBAR_ICON_GLYPH_CLASS} />
    </TitlebarIconButton>
  );

  const headerTrailing = (
    <div className="flex items-center gap-1">
      {pinToggle}
      {closeButton}
    </div>
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

  const actionHeader = (options?: { draggable?: boolean }) => (
    // biome-ignore lint/a11y/noStaticElementInteractions: floating dock drag handle
    <div
      className={cn(
        // pe-3 when pinned aligns close with the titlebar settings pill above.
        "relative z-30 flex shrink-0 items-center py-1 pe-3",
        // Drawer open: parent pe-none so the left strip does not steal hits from
        // the session toggle / outside catcher underneath. Drag + pin/close
        // re-enable pe on their own nodes (pe-none child does not punch a hole
        // through a pe-auto parent).
        sessionListOpen && "pointer-events-none",
        options?.draggable && !sessionListOpen && "cursor-move",
      )}
      onMouseDown={
        options?.draggable && !sessionListOpen ? beginDrag : undefined
      }
    >
      {sessionListOpen ? (
        <div
          aria-hidden
          className="shrink-0"
          style={{ width: sessionListWidth }}
        />
      ) : (
        <div className="flex shrink-0 items-center ps-2">{sessionToggle}</div>
      )}
      {/*
        biome-ignore lint/a11y/noStaticElementInteractions: drag strip while
        the drawer is open (parent is pe-none, so this must own beginDrag).
      */}
      <div
        className={cn(
          "min-w-0 flex-1 self-stretch",
          sessionListOpen &&
            options?.draggable &&
            "pointer-events-auto cursor-move",
        )}
        onMouseDown={
          sessionListOpen && options?.draggable ? beginDrag : undefined
        }
      />
      <div className={cn(sessionListOpen && "pointer-events-auto")}>
        {headerTrailing}
      </div>
    </div>
  );

  return (
    // Outer: only this node is a flex item. Pinned → takes width. Floating →
    // absolute overlay with no in-flow size, so the editor flex sibling
    // reclaims the full row (no residual squeeze after unpin).
    <div
      className={
        pinned
          ? "relative z-20 h-full shrink-0"
          : "pointer-events-none absolute inset-0 z-40"
      }
      style={pinned ? { width: geometry.width } : undefined}
    >
      <div
        className={cn(
          "flex flex-col overflow-hidden",
          pinned
            ? // No bg here: titlebar spacer stays transparent so shell bg-app
              // shows through. Canvas fill lives on the content column below.
              "h-full w-full"
            : // Floating card is a self-contained surface (matches CenterPanel
              // canvas; bg-app is a different token in light mode).
              "pointer-events-auto absolute rounded-panel border border-border bg-chat-canvas shadow-2xl",
        )}
        style={
          pinned
            ? undefined
            : {
                right: geometry.right,
                bottom: geometry.bottom,
                width: geometry.width,
                height: geometry.height,
              }
        }
      >
        {pinned ? (
          // top offset clears the ViewSwitcher band so no vertical stub sticks
          // up through the continuous top horizontal rule.
          // z-40: above action header (z-30) and session-list drawer (z-20).
          <ResizeSeparator
            ariaLabel={t("actions.resizeChat")}
            className="z-40"
            position="absolute-start"
            style={{ top: VIEW_SWITCHER_ROW_HEIGHT_PX }}
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

        {pinned ? (
          <>
            {/*
              Continues ViewSwitcherTabs' border-b across this column. Height is
              locked to VIEW_SWITCHER_ROW_HEIGHT_PX (= TITLEBAR_HEIGHT). No start
              border — that would draw a vertical stub through the top rule.
              Transparent fill so the titlebar band matches shell bg-app.
            */}
            <div
              aria-hidden
              className="flex shrink-0 items-center border-b border-editor-border px-2"
              style={{
                height: VIEW_SWITCHER_ROW_HEIGHT_PX,
                paddingInlineEnd: TITLEBAR_EDITOR_TOGGLE_WIDTH,
              }}
            >
              <div className="size-6 shrink-0" />
            </div>
            <div className="relative flex min-h-0 flex-1 flex-col border-s border-editor-border bg-chat-canvas">
              {/*
                Actions stay on this second row. pe-3 + size-6 (xs) with gap-1
                match the right titlebar sm pills so close right-aligns with
                settings above.
              */}
              {actionHeader()}
              <div className="relative min-h-0 flex-1 overflow-hidden">
                {children}
              </div>
              {sessionListDrawer}
            </div>
          </>
        ) : (
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            {actionHeader({ draggable: true })}
            <div className="relative min-h-0 flex-1 overflow-hidden">
              {children}
            </div>
            {sessionListDrawer}
          </div>
        )}
      </div>
    </div>
  );
}
