import { useCallback, useRef, useState } from "react";
import { beginColumnResize } from "@/components/use-column-resize";
import { useMountEffect } from "@/lib";

/*
 * Chat dock geometry + open/pin preference persistence.
 *
 * Pure UI preference, so it lives in localStorage alongside theme / appearance
 * (see app-shell-preferences.ts) rather than the IPC-backed app snapshot.
 *
 * Floating mode: card anchored bottom-right; geometry stores `right` / `bottom`
 * plus `width` / `height`. Dragging the header moves right/bottom; resizing
 * from the top-left grows width/height while the bottom-right stays pinned.
 *
 * Collapsed FAB position is stored separately (right/bottom only) so the
 * launcher can sit elsewhere than the open card.
 *
 * When the app window shrinks, floating geometry is clamped so the card stays
 * fully visible (width/height only shrink, never grow back with the window).
 * Pinned mode only uses width and participates in the main flex row.
 *
 * The app is always LTR (app-shell-preferences.ts forces dir="ltr"), so
 * physical right/bottom is safe.
 */

// Legacy boolean open flag; migrated into VISIBILITY_STORAGE_KEY.
const OPEN_STORAGE_KEY = "cocurdex.chatDock.open";
const VISIBILITY_STORAGE_KEY = "cocurdex.chatDock.visibility";
const HIDE_FAB_STORAGE_KEY = "cocurdex.chatDock.hideFabWhenClosed";
const PINNED_STORAGE_KEY = "cocurdex.chatDock.pinned";
const GEOMETRY_STORAGE_KEY = "cocurdex.chatDock.geometry";
const FAB_POSITION_STORAGE_KEY = "cocurdex.chatDock.fabPosition";
const SESSION_LIST_WIDTH_STORAGE_KEY = "cocurdex.chatDock.sessionListWidth";

/**
 * Chat dock surface while the editor is fullscreen (float / pinned layout).
 * - open: floating card or pinned rail
 * - collapsed: bottom-right FAB only
 * - hidden: nothing; reopen via shortcut or layout actions
 */
export type ChatDockVisibility = "open" | "collapsed" | "hidden";

export function isChatDockVisibility(
  value: string | null,
): value is ChatDockVisibility {
  return value === "open" || value === "collapsed" || value === "hidden";
}

/** Closed surface after the user dismisses an open dock. */
export function closedChatDockVisibility(
  hideFabWhenClosed: boolean,
): ChatDockVisibility {
  return hideFabWhenClosed ? "hidden" : "collapsed";
}

/**
 * When the "hide FAB when closed" preference flips, keep a non-open dock
 * consistent with the new preference without forcing the dock open.
 */
export function resolveChatDockVisibilityAfterHideFabChange(
  current: ChatDockVisibility,
  hideFabWhenClosed: boolean,
): ChatDockVisibility {
  if (hideFabWhenClosed && current === "collapsed") {
    return "hidden";
  }
  if (!hideFabWhenClosed && current === "hidden") {
    return "collapsed";
  }
  return current;
}

/**
 * Next visibility for the toggle-chat shortcut.
 *
 * - open → closed (FAB, or fully hidden when hideFabWhenClosed)
 * - collapsed → open
 * - hidden + hideFabWhenClosed → open (no FAB in the cycle; shortcut is the
 *   only way back into chat)
 * - hidden without that preference → collapsed (one-shot hide from the FAB
 *   close icon; shortcut restores the button, matching the FAB tooltip — not
 *   the full dock, which would surprise users who only hid the launcher)
 */
export function nextChatDockVisibilityOnToggle(
  current: ChatDockVisibility,
  hideFabWhenClosed: boolean,
): ChatDockVisibility {
  if (current === "open") {
    return closedChatDockVisibility(hideFabWhenClosed);
  }
  if (current === "hidden" && !hideFabWhenClosed) {
    return "collapsed";
  }
  return "open";
}

export const CHAT_DOCK_MIN_WIDTH = 320;
export const CHAT_DOCK_MIN_HEIGHT = 360;
// Dock session-list drawer (floating + pinned). Leave room for chat content.
export const SESSION_LIST_MIN_WIDTH = 180;
export const SESSION_LIST_DEFAULT_WIDTH = 220;
export const SESSION_LIST_MAX_WIDTH = 400;
// Min remaining chat surface beside the session list inside the dock.
const SESSION_LIST_CHAT_MIN = 160;
// Keep the floating card clear of the OS titlebar (top) and window edges.
const EDGE_MARGIN = 8;
const TOP_MARGIN = 40;
// Leave room for the right panel when the dock is pinned.
// Keep in sync with NotesView: sidebar 220 + editor strip 280.
const PINNED_EDITOR_MIN = 500;
// IconButton size="lg" → Button icon-lg → size-9 (36px). Used when measuring
// the FAB is unavailable (window resize clamp).
export const CHAT_FAB_SIZE_PX = 36;
const FAB_DRAG_THRESHOLD_PX = 4;

export interface DockGeometry {
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/** Collapsed chat launcher position (bottom-right anchored, like the card). */
export interface FabPosition {
  right: number;
  bottom: number;
}

const DEFAULT_GEOMETRY: DockGeometry = {
  right: 16,
  bottom: 16,
  width: 380,
  height: 560,
};

const DEFAULT_FAB_POSITION: FabPosition = {
  right: 16,
  bottom: 16,
};

export function getStoredChatDockVisibility(): ChatDockVisibility {
  if (typeof window === "undefined") {
    return "collapsed";
  }

  const stored = window.localStorage.getItem(VISIBILITY_STORAGE_KEY);
  if (isChatDockVisibility(stored)) {
    return stored;
  }

  // Migrate legacy boolean open flag.
  if (window.localStorage.getItem(OPEN_STORAGE_KEY) === "true") {
    return "open";
  }

  return "collapsed";
}

export function persistChatDockVisibility(
  visibility: ChatDockVisibility,
): void {
  window.localStorage.setItem(VISIBILITY_STORAGE_KEY, visibility);
  // Keep legacy flag in sync for any leftover readers.
  window.localStorage.setItem(OPEN_STORAGE_KEY, String(visibility === "open"));
}

export function getStoredHideFabWhenClosed(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(HIDE_FAB_STORAGE_KEY) === "true";
}

export function persistHideFabWhenClosed(hide: boolean): void {
  window.localStorage.setItem(HIDE_FAB_STORAGE_KEY, String(hide));
}

/** @deprecated Prefer getStoredChatDockVisibility. */
export function getStoredChatDockOpen(): boolean {
  return getStoredChatDockVisibility() === "open";
}

/** @deprecated Prefer persistChatDockVisibility. */
export function persistChatDockOpen(open: boolean): void {
  persistChatDockVisibility(open ? "open" : "collapsed");
}

export function getStoredChatDockPinned(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(PINNED_STORAGE_KEY) === "true";
}

export function persistChatDockPinned(pinned: boolean): void {
  window.localStorage.setItem(PINNED_STORAGE_KEY, String(pinned));
}

function getStoredGeometry(): DockGeometry {
  if (typeof window === "undefined") {
    return DEFAULT_GEOMETRY;
  }

  const raw = window.localStorage.getItem(GEOMETRY_STORAGE_KEY);
  if (!raw) {
    return DEFAULT_GEOMETRY;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<DockGeometry>;
    return {
      right: parsed.right ?? DEFAULT_GEOMETRY.right,
      bottom: parsed.bottom ?? DEFAULT_GEOMETRY.bottom,
      width: parsed.width ?? DEFAULT_GEOMETRY.width,
      height: parsed.height ?? DEFAULT_GEOMETRY.height,
    };
  } catch {
    return DEFAULT_GEOMETRY;
  }
}

function persistGeometry(next: DockGeometry): void {
  window.localStorage.setItem(GEOMETRY_STORAGE_KEY, JSON.stringify(next));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function maxPinnedWidth(): number {
  return Math.max(
    CHAT_DOCK_MIN_WIDTH,
    window.innerWidth - PINNED_EDITOR_MIN - EDGE_MARGIN,
  );
}

function geometryEquals(a: DockGeometry, b: DockGeometry): boolean {
  return (
    a.right === b.right &&
    a.bottom === b.bottom &&
    a.width === b.width &&
    a.height === b.height
  );
}

/*
 * Keep a floating dock fully inside the window when the window shrinks.
 * Width/height only decrease (never auto-grow when the window expands).
 * right/bottom are pulled in only when needed so the card is not clipped.
 */
export function fitFloatingGeometryToWindow(
  geometry: DockGeometry,
  winW: number,
  winH: number,
): DockGeometry {
  const maxWidth = Math.max(EDGE_MARGIN, winW - EDGE_MARGIN * 2);
  const maxHeight = Math.max(EDGE_MARGIN, winH - TOP_MARGIN - EDGE_MARGIN);
  // Prefer the usual mins, but allow smaller when the window itself is tiny.
  const minWidth = Math.min(CHAT_DOCK_MIN_WIDTH, maxWidth);
  const minHeight = Math.min(CHAT_DOCK_MIN_HEIGHT, maxHeight);

  const width = clamp(geometry.width, minWidth, maxWidth);
  const height = clamp(geometry.height, minHeight, maxHeight);

  const maxRight = Math.max(EDGE_MARGIN, winW - width - EDGE_MARGIN);
  const maxBottom = Math.max(EDGE_MARGIN, winH - height - TOP_MARGIN);

  return {
    width,
    height,
    right: clamp(geometry.right, EDGE_MARGIN, maxRight),
    bottom: clamp(geometry.bottom, EDGE_MARGIN, maxBottom),
  };
}

/*
 * Live drag + resize for the expanded card / pinned rail. Handlers snapshot on
 * mousedown and compute absolute geometry from the pointer delta, so no ref
 * mirror of state is needed. Window listeners attach inside the mousedown
 * handler (an event, not an effect) and remove on mouseup, which also persists.
 *
 * A mount-time window resize listener clamps floating geometry when the app
 * window shrinks so the card is not covered by the window edge.
 */
export function useDockGeometry() {
  const [geometry, setGeometry] = useState<DockGeometry>(() => {
    if (typeof window === "undefined") {
      return getStoredGeometry();
    }
    return fitFloatingGeometryToWindow(
      getStoredGeometry(),
      window.innerWidth,
      window.innerHeight,
    );
  });

  useMountEffect(() => {
    const onResize = () => {
      setGeometry((prev) => {
        const next = fitFloatingGeometryToWindow(
          prev,
          window.innerWidth,
          window.innerHeight,
        );
        if (geometryEquals(prev, next)) {
          return prev;
        }
        persistGeometry(next);
        return next;
      });
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  });

  const beginDrag = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      const startX = event.clientX;
      const startY = event.clientY;
      const start = geometry;

      const compute = (moveEvent: MouseEvent): DockGeometry => ({
        ...start,
        right: clamp(
          start.right - (moveEvent.clientX - startX),
          EDGE_MARGIN,
          window.innerWidth - start.width - EDGE_MARGIN,
        ),
        bottom: clamp(
          start.bottom - (moveEvent.clientY - startY),
          EDGE_MARGIN,
          window.innerHeight - start.height - TOP_MARGIN,
        ),
      });

      const onMove = (moveEvent: MouseEvent) => {
        setGeometry(compute(moveEvent));
      };

      const onUp = (upEvent: MouseEvent) => {
        const next = compute(upEvent);
        setGeometry(next);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        persistGeometry(next);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [geometry],
  );

  const beginResize = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startY = event.clientY;
      const start = geometry;

      const compute = (moveEvent: MouseEvent): DockGeometry => {
        const maxWidth = window.innerWidth - start.right - EDGE_MARGIN;
        const maxHeight = window.innerHeight - start.bottom - TOP_MARGIN;
        return {
          ...start,
          width: clamp(
            start.width - (moveEvent.clientX - startX),
            CHAT_DOCK_MIN_WIDTH,
            maxWidth,
          ),
          height: clamp(
            start.height - (moveEvent.clientY - startY),
            CHAT_DOCK_MIN_HEIGHT,
            maxHeight,
          ),
        };
      };

      const onMove = (moveEvent: MouseEvent) => {
        setGeometry(compute(moveEvent));
      };

      const onUp = (upEvent: MouseEvent) => {
        const next = compute(upEvent);
        setGeometry(next);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        persistGeometry(next);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [geometry],
  );

  // Pinned rail: only width changes; left edge moves, right edge stays flush.
  const beginPinnedResize = useCallback(
    (event: React.MouseEvent) => {
      const start = geometry;
      beginColumnResize(event, {
        edge: "inline-start",
        startWidth: start.width,
        stopPropagation: true,
        clamp: (next) => clamp(next, CHAT_DOCK_MIN_WIDTH, maxPinnedWidth()),
        onWidthChange: (width) => {
          setGeometry({ ...start, width });
        },
        onDragEnd: (width) => {
          const next = { ...start, width };
          setGeometry(next);
          persistGeometry(next);
        },
      });
    },
    [geometry],
  );

  return { geometry, beginDrag, beginResize, beginPinnedResize };
}

function getStoredFabPosition(): FabPosition {
  if (typeof window === "undefined") {
    return DEFAULT_FAB_POSITION;
  }

  const raw = window.localStorage.getItem(FAB_POSITION_STORAGE_KEY);
  if (!raw) {
    return DEFAULT_FAB_POSITION;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<FabPosition>;
    return {
      right: parsed.right ?? DEFAULT_FAB_POSITION.right,
      bottom: parsed.bottom ?? DEFAULT_FAB_POSITION.bottom,
    };
  } catch {
    return DEFAULT_FAB_POSITION;
  }
}

function persistFabPosition(next: FabPosition): void {
  window.localStorage.setItem(FAB_POSITION_STORAGE_KEY, JSON.stringify(next));
}

function fabPositionEquals(a: FabPosition, b: FabPosition): boolean {
  return a.right === b.right && a.bottom === b.bottom;
}

/**
 * Keep the collapsed chat FAB inside the window and clear of the absolute
 * titlebar that overlays `main` (same top clearance as the floating card).
 */
export function fitFabPositionToWindow(
  position: FabPosition,
  winW: number,
  winH: number,
  fabSize = CHAT_FAB_SIZE_PX,
): FabPosition {
  const maxRight = Math.max(EDGE_MARGIN, winW - fabSize - EDGE_MARGIN);
  // bottom is measured from the window bottom; cap so the FAB top stays below
  // TOP_MARGIN (titlebar + edge padding).
  const maxBottom = Math.max(EDGE_MARGIN, winH - fabSize - TOP_MARGIN);
  return {
    right: clamp(position.right, EDGE_MARGIN, maxRight),
    bottom: clamp(position.bottom, EDGE_MARGIN, maxBottom),
  };
}

/*
 * Position + drag for the collapsed chat FAB. Independent of open-card
 * geometry. Click vs drag is distinguished with a small movement threshold so
 * a plain click still opens chat.
 */
export function useFabPosition() {
  const [position, setPosition] = useState<FabPosition>(() => {
    if (typeof window === "undefined") {
      return getStoredFabPosition();
    }
    return fitFabPositionToWindow(
      getStoredFabPosition(),
      window.innerWidth,
      window.innerHeight,
    );
  });
  // True after a real drag; cleared by consumeDragClick or a deferred reset
  // so the trailing click after mouseup can be swallowed.
  const draggedRef = useRef(false);

  useMountEffect(() => {
    const onResize = () => {
      setPosition((prev) => {
        const next = fitFabPositionToWindow(
          prev,
          window.innerWidth,
          window.innerHeight,
        );
        if (fabPositionEquals(prev, next)) {
          return prev;
        }
        persistFabPosition(next);
        return next;
      });
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  });

  const beginDrag = useCallback(
    (event: React.MouseEvent) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      const startX = event.clientX;
      const startY = event.clientY;
      const start = position;
      const target = event.currentTarget as HTMLElement;
      const fabSize = target.offsetWidth || CHAT_FAB_SIZE_PX;
      draggedRef.current = false;

      const compute = (moveEvent: MouseEvent): FabPosition =>
        fitFabPositionToWindow(
          {
            right: start.right - (moveEvent.clientX - startX),
            bottom: start.bottom - (moveEvent.clientY - startY),
          },
          window.innerWidth,
          window.innerHeight,
          fabSize,
        );

      const onMove = (moveEvent: MouseEvent) => {
        const dx = Math.abs(moveEvent.clientX - startX);
        const dy = Math.abs(moveEvent.clientY - startY);
        if (dx > FAB_DRAG_THRESHOLD_PX || dy > FAB_DRAG_THRESHOLD_PX) {
          draggedRef.current = true;
        }
        if (!draggedRef.current) {
          return;
        }
        setPosition(compute(moveEvent));
      };

      const onUp = (upEvent: MouseEvent) => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        if (!draggedRef.current) {
          return;
        }
        const next = compute(upEvent);
        setPosition(next);
        persistFabPosition(next);
        // Defer clearing so the trailing click can read the drag flag first.
        window.setTimeout(() => {
          draggedRef.current = false;
        }, 0);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [position],
  );

  const consumeDragClick = useCallback(() => {
    if (!draggedRef.current) {
      return false;
    }
    draggedRef.current = false;
    return true;
  }, []);

  return { position, beginDrag, consumeDragClick };
}

function getStoredSessionListWidth(): number {
  if (typeof window === "undefined") {
    return SESSION_LIST_DEFAULT_WIDTH;
  }

  const raw = window.localStorage.getItem(SESSION_LIST_WIDTH_STORAGE_KEY);
  if (!raw) {
    return SESSION_LIST_DEFAULT_WIDTH;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return SESSION_LIST_DEFAULT_WIDTH;
  }

  return clamp(parsed, SESSION_LIST_MIN_WIDTH, SESSION_LIST_MAX_WIDTH);
}

function persistSessionListWidth(width: number): void {
  window.localStorage.setItem(SESSION_LIST_WIDTH_STORAGE_KEY, String(width));
}

export function maxSessionListWidth(dockWidth: number): number {
  return Math.min(
    SESSION_LIST_MAX_WIDTH,
    Math.max(SESSION_LIST_MIN_WIDTH, dockWidth - SESSION_LIST_CHAT_MIN),
  );
}

/**
 * Width of the dock's session-list drawer. Persisted separately from dock
 * geometry so floating/pinned size and the drawer width can change independently.
 * Clamped live against the current dock width so the chat surface stays usable.
 */
export function useSessionListWidth(dockWidth: number) {
  const [width, setWidth] = useState(getStoredSessionListWidth);
  const maxWidth = maxSessionListWidth(dockWidth);
  const effectiveWidth = clamp(width, SESSION_LIST_MIN_WIDTH, maxWidth);

  const beginResize = useCallback(
    (event: React.MouseEvent) => {
      const liveMax = maxSessionListWidth(dockWidth);
      beginColumnResize(event, {
        edge: "inline-end",
        startWidth: effectiveWidth,
        stopPropagation: true,
        clamp: (next) => clamp(next, SESSION_LIST_MIN_WIDTH, liveMax),
        onWidthChange: setWidth,
        onDragEnd: (next) => {
          persistSessionListWidth(next);
        },
      });
    },
    [dockWidth, effectiveWidth],
  );

  return { width: effectiveWidth, beginResize };
}
