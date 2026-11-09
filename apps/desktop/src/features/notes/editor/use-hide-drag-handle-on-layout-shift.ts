import type { Editor } from "@tiptap/react";
import { type RefObject, useEffect, useRef } from "react";

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
