import { useCallback, useRef, useState } from "react";
import { beginColumnResize } from "@/components/use-column-resize";
import {
  getStoredLeftWidth,
  getStoredRightWidth,
  persistLeftWidth,
  persistRightWidth,
} from "../chat-layout-preference";
import { MAX_LEFT, MIN_LEFT } from "./app-shell-layout";
import {
  clampPanelWidth,
  MIN_CHAT_WIDTH,
  MIN_RIGHT_WIDTH,
  PANEL_SEPARATOR_WIDTH,
  resolveCompactPanel,
} from "./panel-geometry";

export const MIN_RIGHT = MIN_RIGHT_WIDTH;

export const DEFAULT_LEFT = 240;
export const DEFAULT_RIGHT = MIN_RIGHT;
export const LEFT_SIDEBAR_COLLAPSE_WIDTH =
  MIN_LEFT + MIN_CHAT_WIDTH + PANEL_SEPARATOR_WIDTH;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getContainerWidth(container: HTMLElement | null) {
  return container?.clientWidth ?? window.innerWidth;
}

export function getInitialContentWidth() {
  if (typeof window === "undefined") {
    return 1440;
  }

  return window.innerWidth;
}

function getMaxLeftWidth(totalWidth: number) {
  const layoutMax = Math.max(
    MIN_LEFT,
    totalWidth - MIN_CHAT_WIDTH - PANEL_SEPARATOR_WIDTH,
  );
  return Math.min(MAX_LEFT, layoutMax);
}

export function clampLeftWidth(nextLeftWidth: number, totalWidth: number) {
  return clamp(nextLeftWidth, MIN_LEFT, getMaxLeftWidth(totalWidth));
}

export function clampRightWidth(nextRightWidth: number, totalWidth: number) {
  return clampPanelWidth(nextRightWidth, totalWidth);
}

interface AppShellResizeOptions {
  isLeftSidebarOpen: boolean;
  isRightPanelOpen: boolean;
  setRightPanelResizing(resizing: boolean): void;
}

function getInitialLeftWidth() {
  const stored = getStoredLeftWidth() ?? DEFAULT_LEFT;
  return clamp(stored, MIN_LEFT, MAX_LEFT);
}

function getInitialRightWidth() {
  const stored = getStoredRightWidth();
  if (stored !== null) {
    return Math.max(MIN_RIGHT, stored);
  }
  if (typeof window !== "undefined") {
    return Math.max(MIN_RIGHT, Math.round(window.innerWidth * 0.4));
  }
  return DEFAULT_RIGHT;
}

export function useAppShellResize({
  isLeftSidebarOpen,
  isRightPanelOpen,
  setRightPanelResizing,
}: AppShellResizeOptions) {
  const [viewport, setViewport] = useState(() => {
    const width = getInitialContentWidth();
    return { width, compact: resolveCompactPanel(width, false) };
  });
  const contentWidth = viewport.width;
  const [leftWidth, setLeftWidth] = useState(getInitialLeftWidth);
  const [rightWidth, setRightWidth] = useState(getInitialRightWidth);
  const effectiveRightWidth = clampPanelWidth(rightWidth, contentWidth);
  const effectiveLeftWidth = clampLeftWidth(leftWidth, contentWidth);
  const contentRowRef = useRef<HTMLElement | null>(null);
  const leftWidthRef = useRef(getInitialLeftWidth());
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  leftWidthRef.current = effectiveLeftWidth;

  const syncContentWidth = useCallback((totalWidth: number) => {
    setViewport((previous) => ({
      width: totalWidth,
      compact: resolveCompactPanel(totalWidth, previous.compact),
    }));
  }, []);

  const contentRowCallbackRef = useCallback(
    (node: HTMLElement | null) => {
      resizeCleanupRef.current?.();
      resizeCleanupRef.current = null;
      contentRowRef.current = node;

      if (!node || typeof window === "undefined") {
        return;
      }

      if (typeof ResizeObserver !== "undefined") {
        const resizeObserver = new ResizeObserver(([entry]) => {
          syncContentWidth(Math.round(entry.contentRect.width));
        });

        resizeObserver.observe(node);
        syncContentWidth(node.clientWidth);
        resizeCleanupRef.current = () => resizeObserver.disconnect();
        return;
      }

      const syncWindowWidth = () => {
        syncContentWidth(window.innerWidth);
      };

      syncWindowWidth();
      window.addEventListener("resize", syncWindowWidth);
      resizeCleanupRef.current = () => {
        window.removeEventListener("resize", syncWindowWidth);
      };
    },
    [syncContentWidth],
  );

  const handleResizeMouseDown = useCallback(
    (target: "left" | "right", event: React.MouseEvent) => {
      dragCleanupRef.current?.();
      const startWidth =
        target === "left"
          ? isLeftSidebarOpen
            ? effectiveLeftWidth
            : 0
          : isRightPanelOpen
            ? effectiveRightWidth
            : 0;

      dragCleanupRef.current = beginColumnResize(event, {
        edge: target === "left" ? "inline-end" : "inline-start",
        startWidth,
        clamp: (next) => {
          const totalWidth = getContainerWidth(contentRowRef.current);
          if (target === "left") {
            return clampLeftWidth(next, totalWidth);
          }
          return clampRightWidth(next, totalWidth);
        },
        onWidthChange: (next) => {
          if (target === "left") {
            setLeftWidth(next);
            return;
          }
          setRightWidth(next);
        },
        onDragStart: () => {
          if (target === "right") {
            setRightPanelResizing(true);
          }
        },
        onDragEnd: (finalWidth) => {
          dragCleanupRef.current = null;
          setRightPanelResizing(false);
          // Persist the column the user just finished resizing.
          if (target === "left") {
            persistLeftWidth(finalWidth);
          } else {
            persistRightWidth(finalWidth);
          }
        },
      });
    },
    [
      isLeftSidebarOpen,
      isRightPanelOpen,
      effectiveLeftWidth,
      effectiveRightWidth,
      setRightPanelResizing,
    ],
  );

  const restoreLeftWidth = () => {
    const totalWidth = getContainerWidth(contentRowRef.current);
    setLeftWidth(clampLeftWidth(leftWidthRef.current, totalWidth));
  };

  return {
    contentRowCallbackRef,
    contentWidth,
    handleResizeMouseDown,
    leftWidth: effectiveLeftWidth,
    restoreLeftWidth,
    rightWidth: effectiveRightWidth,
    isRightPanelCompact: isRightPanelOpen && viewport.compact,
  };
}
