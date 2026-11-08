import { useCallback, useRef, useState } from "react";

const DRAG_THRESHOLD_PX = 3;
const DRAG_EDGE_MARGIN_PX = 8;

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

export function useVerticalDrag<T extends HTMLElement>() {
  const [offsetY, setOffsetY] = useState(0);
  const offsetYRef = useRef(0);
  const rootRef = useRef<T | null>(null);
  const isDraggingRef = useRef(false);

  const applyOffset = useCallback((next: number) => {
    offsetYRef.current = next;
    setOffsetY(next);
  }, []);

  const consumeDragClick = useCallback(() => {
    if (!isDraggingRef.current) {
      return false;
    }

    isDraggingRef.current = false;
    return true;
  }, []);

  const startDrag = useCallback(
    (clientY: number) => {
      const root = rootRef.current;
      const container = root?.parentElement;
      if (!root || !container) {
        return;
      }

      const startOffsetY = offsetYRef.current;
      const containerHeight = container.clientHeight;
      const panelHeight = root.clientHeight;
      const panelTop = root.offsetTop;
      isDraggingRef.current = false;
      document.body.style.userSelect = "none";

      const handleMouseMove = (event: MouseEvent) => {
        const deltaY = event.clientY - clientY;
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
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
        document.body.style.userSelect = "";
        if (isDraggingRef.current) {
          window.setTimeout(() => {
            isDraggingRef.current = false;
          }, 0);
        }
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [applyOffset],
  );

  return { offsetY, rootRef, startDrag, consumeDragClick };
}
