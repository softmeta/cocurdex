import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const MIN_THUMB_LENGTH = 24;

interface PanScrollbarProps {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  className?: string;
}

// Custom horizontal scrollbar for the overlay-pan body region. macOS hides all
// native scrollbars (see base.css), and the native BrowserView swallows wheel
// gestures above it anyway, so panning needs a visible, draggable DOM thumb.
export function PanScrollbar({ viewportRef, className }: PanScrollbarProps) {
  const [thumb, setThumb] = useState({ start: 0, length: 0 });
  const dragRef = useRef<{
    grabOffset: number;
    scale: number;
    trackStart: number;
    rtl: boolean;
  } | null>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const update = () => {
      const trackLength = viewport.clientWidth;
      const scrollWidth = viewport.scrollWidth;
      if (trackLength <= 0 || scrollWidth <= trackLength) {
        setThumb({ start: 0, length: 0 });
        return;
      }
      const scale = trackLength / scrollWidth;
      // Chrome reports RTL scrollLeft in [trackLength - scrollWidth, 0]; LTR
      // uses [0, scrollWidth - trackLength]. The sign fold makes |scrollLeft|
      // the distance from the inline start edge in both directions.
      const sign = getComputedStyle(viewport).direction === "rtl" ? -1 : 1;
      const length = Math.max(trackLength * scale, MIN_THUMB_LENGTH);
      const start = Math.min(
        Math.max(viewport.scrollLeft * sign * scale, 0),
        trackLength - length,
      );
      setThumb({ start, length });
    };
    update();
    viewport.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    const content = viewport.firstElementChild;
    if (content) {
      observer.observe(content);
    }
    return () => {
      viewport.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [viewportRef]);

  const scrollFromClientX = useCallback(
    (clientX: number) => {
      const viewport = viewportRef.current;
      const drag = dragRef.current;
      if (!viewport || !drag) {
        return;
      }
      const offset = drag.rtl
        ? drag.trackStart - clientX
        : clientX - drag.trackStart;
      viewport.scrollLeft =
        ((offset - drag.grabOffset) / drag.scale) * (drag.rtl ? -1 : 1);
    },
    [viewportRef],
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const viewport = viewportRef.current;
      if (!viewport || viewport.scrollWidth <= viewport.clientWidth) {
        return;
      }
      const track = event.currentTarget;
      const rect = track.getBoundingClientRect();
      const rtl = getComputedStyle(track).direction === "rtl";
      const offset = rtl
        ? rect.right - event.clientX
        : event.clientX - rect.left;
      const onThumb =
        offset >= thumb.start && offset <= thumb.start + thumb.length;
      dragRef.current = {
        grabOffset: onThumb ? offset - thumb.start : thumb.length / 2,
        scale: rect.width / viewport.scrollWidth,
        trackStart: rtl ? rect.right : rect.left,
        rtl,
      };
      if (!onThumb) {
        scrollFromClientX(event.clientX);
      }
      track.setPointerCapture(event.pointerId);
    },
    [scrollFromClientX, thumb, viewportRef],
  );

  return (
    <div
      className={cn("relative h-2 shrink-0 touch-none select-none", className)}
      data-slot="pan-scrollbar"
      onLostPointerCapture={endDrag}
      onPointerDown={handlePointerDown}
      onPointerMove={(event) => {
        if (dragRef.current) {
          scrollFromClientX(event.clientX);
        }
      }}
      onPointerUp={endDrag}
    >
      <div
        className="absolute inset-y-0 rounded-full [background:var(--scrollbar-thumb)] hover:[background:var(--scrollbar-thumb-hover)]"
        data-slot="pan-scrollbar-thumb"
        style={{ insetInlineStart: thumb.start, width: thumb.length }}
      />
    </div>
  );
}
