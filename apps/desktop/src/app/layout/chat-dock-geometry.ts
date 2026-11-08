import { useCallback, useRef, useState } from "react";
import { beginColumnResize } from "@/components/use-column-resize";
import { useMountEffect } from "@/lib";
import {
  CHAT_DOCK_MIN_WIDTH,
  resolveChatDockPinLayout,
} from "./chat-dock-sizing";

export { CHAT_DOCK_MIN_WIDTH } from "./chat-dock-sizing";

const OPEN_STORAGE_KEY = "cocurdex.chatDock.open";
const VISIBILITY_STORAGE_KEY = "cocurdex.chatDock.visibility";
const HIDE_FAB_STORAGE_KEY = "cocurdex.chatDock.hideFabWhenClosed";
const PINNED_STORAGE_KEY = "cocurdex.chatDock.pinned";
const GEOMETRY_STORAGE_KEY = "cocurdex.chatDock.geometry";
const FAB_POSITION_STORAGE_KEY = "cocurdex.chatDock.fabPosition";
const SESSION_LIST_WIDTH_STORAGE_KEY = "cocurdex.chatDock.sessionListWidth";

export type ChatDockVisibility = "open" | "collapsed" | "hidden";

export function isChatDockVisibility(
  value: string | null,
): value is ChatDockVisibility {
  return value === "open" || value === "collapsed" || value === "hidden";
}

export function closedChatDockVisibility(
  hideFabWhenClosed: boolean,
): ChatDockVisibility {
  return hideFabWhenClosed ? "hidden" : "collapsed";
}

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

export const CHAT_DOCK_MIN_HEIGHT = 360;
export const SESSION_LIST_MIN_WIDTH = 180;
export const SESSION_LIST_DEFAULT_WIDTH = 220;
export const SESSION_LIST_MAX_WIDTH = 400;
const SESSION_LIST_CHAT_MIN = 160;
const EDGE_MARGIN = 8;
const TOP_MARGIN = 40;
export const CHAT_FAB_SIZE_PX = 36;
const FAB_DRAG_THRESHOLD_PX = 4;
const WINDOW_RESIZE_SETTLE_MS = 150;

export interface DockGeometry {
  right: number;
  bottom: number;
  width: number;
  height: number;
}

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

let chatDockVisibilityHandler:
  | ((visibility: ChatDockVisibility) => void)
  | null = null;

export function registerChatDockVisibilityHandler(
  handler: (visibility: ChatDockVisibility) => void,
) {
  chatDockVisibilityHandler = handler;
  return () => {
    if (chatDockVisibilityHandler === handler) {
      chatDockVisibilityHandler = null;
    }
  };
}

export function requestChatDockVisibility(visibility: ChatDockVisibility) {
  chatDockVisibilityHandler?.(visibility);
}

export function getStoredChatDockVisibility(): ChatDockVisibility {
  if (typeof window === "undefined") {
    return "collapsed";
  }

  const stored = window.localStorage.getItem(VISIBILITY_STORAGE_KEY);
  if (isChatDockVisibility(stored)) {
    return stored;
  }

  if (window.localStorage.getItem(OPEN_STORAGE_KEY) === "true") {
    return "open";
  }

  return "collapsed";
}

export function persistChatDockVisibility(
  visibility: ChatDockVisibility,
): void {
  window.localStorage.setItem(VISIBILITY_STORAGE_KEY, visibility);
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

export function getStoredChatDockOpen(): boolean {
  return getStoredChatDockVisibility() === "open";
}

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

function geometryEquals(a: DockGeometry, b: DockGeometry): boolean {
  return (
    a.right === b.right &&
    a.bottom === b.bottom &&
    a.width === b.width &&
    a.height === b.height
  );
}

export function fitFloatingGeometryToWindow(
  geometry: DockGeometry,
  winW: number,
  winH: number,
): DockGeometry {
  const maxWidth = Math.max(EDGE_MARGIN, winW - EDGE_MARGIN * 2);
  const maxHeight = Math.max(EDGE_MARGIN, winH - TOP_MARGIN - EDGE_MARGIN);
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

  const beginPinnedResize = useCallback(
    (event: React.MouseEvent) => {
      const start = geometry;
      beginColumnResize(event, {
        edge: "inline-start",
        startWidth: resolveChatDockPinLayout(window.innerWidth, start.width)
          .width,
        stopPropagation: true,
        clamp: (next) =>
          resolveChatDockPinLayout(window.innerWidth, next).width,
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

export function fitFabPositionToWindow(
  position: FabPosition,
  winW: number,
  winH: number,
  fabSize = CHAT_FAB_SIZE_PX,
): FabPosition {
  const maxRight = Math.max(EDGE_MARGIN, winW - fabSize - EDGE_MARGIN);
  const maxBottom = Math.max(EDGE_MARGIN, winH - fabSize - TOP_MARGIN);
  return {
    right: clamp(position.right, EDGE_MARGIN, maxRight),
    bottom: clamp(position.bottom, EDGE_MARGIN, maxBottom),
  };
}

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
  const draggedRef = useRef(false);
  const [windowResizing, setWindowResizing] = useState(false);

  useMountEffect(() => {
    let settleTimer: number | undefined;
    const onResize = () => {
      setWindowResizing(true);
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(
        () => setWindowResizing(false),
        WINDOW_RESIZE_SETTLE_MS,
      );
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
    return () => {
      window.clearTimeout(settleTimer);
      window.removeEventListener("resize", onResize);
    };
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

  return { position, windowResizing, beginDrag, consumeDragClick };
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
