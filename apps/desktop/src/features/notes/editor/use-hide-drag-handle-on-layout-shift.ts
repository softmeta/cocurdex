import type { Editor } from "@tiptap/react";
import { type RefObject, useEffect, useRef } from "react";

/**
 * Tiptap DragHandle only repositions when the hovered *node* changes (not when
 * the same node moves in the viewport). Sidebar / panel resizes shift the
 * editor while the handle keeps its previous absolute left/top.
 *
 * Observe the editor chrome for size changes and clear the handle via the
 * plugin's `hideDragHandle` meta so the next mousemove re-targets and
 * repositions. ResizeObserver is the external layout system being synced.
 */
export function useHideDragHandleOnLayoutShift(
  editor: Editor | null,
): RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!editor || !container) {
      return;
    }

    let lastWidth = container.getBoundingClientRect().width;
    let lastHeight = container.getBoundingClientRect().height;

    const observer = new ResizeObserver(() => {
      if (editor.isDestroyed) {
        return;
      }
      const rect = container.getBoundingClientRect();
      if (
        Math.abs(rect.width - lastWidth) < 0.5 &&
        Math.abs(rect.height - lastHeight) < 0.5
      ) {
        return;
      }
      lastWidth = rect.width;
      lastHeight = rect.height;
      editor.view.dispatch(editor.state.tr.setMeta("hideDragHandle", true));
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [editor]);

  return containerRef;
}
