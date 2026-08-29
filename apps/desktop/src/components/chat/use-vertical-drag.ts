import { useCallback, useEffect, useRef, useState } from "react";

const DRAG_THRESHOLD_PX = 3;
const DRAG_EDGE_MARGIN_PX = 8;

// Clamps an offset so the dragged panel stays inside its container. The bounds
// are taken from the panel's actual natural top (`panelTop`) within the
// container, not assumed to be centered — a panel anchored near the bottom can
// travel far up but only a little down, so it never slides past the container
// edge and gets clipped by `overflow-hidden`.
export function clampOffset(
  offset: number,
  containerHeight: number,
  panelHeight: number,
  panelTop: number,
) {
  const minOffset = DRAG_EDGE_MARGIN_PX - panelTop;
  const maxOffset =
    containerHeight - DRAG_EDGE_MARGIN_PX - panelHeight - panelTop;
  if (maxOffset <= minOffset) {
    return 0;
  }
  return Math.max(minOffset, Math.min(maxOffset, offset));
}

// Shared vertical-drag behaviour for left-rail floating panels. Tracks a
// translateY offset the caller applies to `rootRef`, and distinguishes a real
// drag from a click so the panel's buttons still fire on a plain click.
export function useVerticalDrag<T extends HTMLElement>() {
  const [offsetY, setOffsetY] = useState(0);
  const offsetYRef = useRef(0);
  const rootRef = useRef<T | null>(null);
  const dragState = useRef<{
    startY: number;
    startOffsetY: number;
    containerHeight: number;
    panelHeight: number;
    panelTop: number;
  } | null>(null);
  const isDraggingRef = useRef(false);

  const applyOffset = useCallback((next: number) => {
    offsetYRef.current = next;
    setOffsetY(next);
  }, []);

  // Returns true (and resets) when the just-finished gesture was a drag, so
  // callers can swallow the click that the browser fires after mouseup.
  const consumeDragClick = useCallback(() => {
    if (!isDraggingRef.current) {
      return false;
    }

    isDraggingRef.current = false;
    return true;
  }, []);

  const startDrag = useCallback((clientY: number) => {
    const root = rootRef.current;
    const container = root?.parentElement;
    if (!root || !container) {
      return;
    }

    dragState.current = {
      startY: clientY,
      startOffsetY: offsetYRef.current,
      containerHeight: container.clientHeight,
      panelHeight: root.clientHeight,
      // Natural top within the container, ignoring the drag transform. Drives
      // an asymmetric clamp so a bottom-anchored panel can't be dragged off
      // the bottom edge.
      panelTop: root.offsetTop,
    };
    isDraggingRef.current = false;
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!dragState.current) {
        return;
      }

      const { startY, startOffsetY, containerHeight, panelHeight, panelTop } =
        dragState.current;
      const deltaY = event.clientY - startY;

      if (Math.abs(deltaY) > DRAG_THRESHOLD_PX) {
        isDraggingRef.current = true;
      }

      applyOffset(
        clampOffset(
          startOffsetY + deltaY,
          containerHeight,
          panelHeight,
          panelTop,
        ),
      );
    };

    const handleMouseUp = () => {
      const wasDragging = isDraggingRef.current;
      dragState.current = null;
      document.body.style.userSelect = "";

      if (wasDragging) {
        // Defer clearing so the trailing click can read the drag flag first.
        window.setTimeout(() => {
          isDraggingRef.current = false;
        }, 0);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [applyOffset]);

  return { offsetY, rootRef, startDrag, consumeDragClick };
}
