import { useCallback, useRef, useState } from "react";
import { beginColumnResize } from "@/components/use-column-resize";
import {
  getStoredLeftWidth,
  getStoredRightWidth,
  persistLeftWidth,
  persistRightWidth,
} from "../chat-layout-preference";
import { MAX_LEFT, MIN_LEFT } from "./app-shell-layout";

const MIN_CENTER = 380;
export const MIN_RIGHT = 460;
const SEPARATOR_COUNT = 2;
const SEPARATOR_WIDTH = 1;

export const DEFAULT_LEFT = 240;
export const DEFAULT_RIGHT = 280;
export const LEFT_SIDEBAR_COLLAPSE_WIDTH =
  MIN_LEFT + MIN_CENTER + SEPARATOR_WIDTH;
export const RIGHT_PANEL_COLLAPSE_WIDTH =
  MIN_LEFT + MIN_CENTER + MIN_RIGHT + SEPARATOR_COUNT * SEPARATOR_WIDTH;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getContainerWidth(container: HTMLElement | null) {
  return container?.clientWidth ?? window.innerWidth;
}

export function getInitialContentWidth() {
  if (typeof window === "undefined") {
    return RIGHT_PANEL_COLLAPSE_WIDTH;
  }

  return window.innerWidth;
}

function getMaxLeftWidth(totalWidth: number, rightWidth: number) {
  // Remaining-space max (leave room for center + right), then absolute cap so
  // a wide window cannot drag the session rail past MAX_LEFT.
  const layoutMax = Math.max(
    MIN_LEFT,
    totalWidth - rightWidth - MIN_CENTER - SEPARATOR_COUNT * SEPARATOR_WIDTH,
  );
  return Math.min(MAX_LEFT, layoutMax);
}

function getMaxRightWidth(totalWidth: number, leftWidth: number) {
  return Math.max(
    MIN_RIGHT,
    totalWidth - leftWidth - MIN_CENTER - SEPARATOR_COUNT * SEPARATOR_WIDTH,
  );
}

export function clampLeftWidth(
  nextLeftWidth: number,
  totalWidth: number,
  rightWidth: number,
) {
  return clamp(
    nextLeftWidth,
    MIN_LEFT,
    getMaxLeftWidth(totalWidth, rightWidth),
  );
}

export function clampRightWidth(
  nextRightWidth: number,
  totalWidth: number,
  leftWidth: number,
) {
  return clamp(
    nextRightWidth,
    MIN_RIGHT,
    getMaxRightWidth(totalWidth, leftWidth),
  );
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
  const [contentWidth, setContentWidth] = useState(getInitialContentWidth);
  const [leftWidth, setLeftWidth] = useState(getInitialLeftWidth);
  const [rightWidth, setRightWidth] = useState(getInitialRightWidth);
  const contentRowRef = useRef<HTMLElement | null>(null);
  const leftWidthRef = useRef(getInitialLeftWidth());
  const rightWidthRef = useRef(getInitialRightWidth());
  const effectiveLeftWidthRef = useRef(0);
  const effectiveRightWidthRef = useRef(0);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  leftWidthRef.current = leftWidth;
  rightWidthRef.current = rightWidth;

  const syncContentWidth = useCallback((totalWidth: number) => {
    setContentWidth(totalWidth);
    setLeftWidth(
      clampLeftWidth(
        leftWidthRef.current,
        totalWidth,
        effectiveRightWidthRef.current,
      ),
    );
    setRightWidth(
      clampRightWidth(
        rightWidthRef.current,
        totalWidth,
        effectiveLeftWidthRef.current,
      ),
    );
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
            ? leftWidth
            : 0
          : isRightPanelOpen
            ? rightWidth
            : 0;

      dragCleanupRef.current = beginColumnResize(event, {
        edge: target === "left" ? "inline-end" : "inline-start",
        startWidth,
        clamp: (next) => {
          const totalWidth = getContainerWidth(contentRowRef.current);
          if (target === "left") {
            return clampLeftWidth(
              next,
              totalWidth,
              effectiveRightWidthRef.current,
            );
          }
          return clampRightWidth(
            next,
            totalWidth,
            effectiveLeftWidthRef.current,
          );
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
      leftWidth,
      rightWidth,
      setRightPanelResizing,
    ],
  );

  const restoreLeftWidth = (effectiveRightWidth: number) => {
    const totalWidth = getContainerWidth(contentRowRef.current);
    setLeftWidth(
      clampLeftWidth(leftWidthRef.current, totalWidth, effectiveRightWidth),
    );
  };

  const restoreRightWidth = (effectiveLeftWidth: number) => {
    const totalWidth = getContainerWidth(contentRowRef.current);
    setRightWidth(
      clampRightWidth(rightWidthRef.current, totalWidth, effectiveLeftWidth),
    );
  };

  return {
    contentRowCallbackRef,
    contentWidth,
    effectiveLeftWidthRef,
    effectiveRightWidthRef,
    handleResizeMouseDown,
    leftWidth,
    restoreLeftWidth,
    restoreRightWidth,
    rightWidth,
  };
}
