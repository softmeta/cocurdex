import { useEffect, useRef, useState } from "react";

// Tracks the floating sticky-prompt overlay's height so in-document heading
// anchors can push their scroll target (`scroll-margin-top`) below the overlay
// instead of landing underneath it. The overlay is conditionally rendered, so
// callers pass `present` to reset the offset to 0 when it unmounts.
export function useStickyOverlayOffset(present: boolean) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const element = overlayRef.current;
    if (!present || !element) {
      setOffset(0);
      return;
    }

    const update = () => setOffset(element.offsetHeight);
    update();

    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [present]);

  return { offset, overlayRef };
}
