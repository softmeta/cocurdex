import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";
import * as React from "react";

import { cn } from "@/lib/utils";

// Browsers floor `clientHeight`/`clientWidth` and ceil `scrollHeight`/
// `scrollWidth`, so a fractional content size reports a phantom 1px overflow.
// Base UI's own check (`viewportHeight >= scrollHeight`) has no tolerance and
// therefore renders a thumb for content that visually fits. We re-derive the
// real overflow with a 1px tolerance and gate scrollbar visibility on it (see
// `.scrollbar-interactive[data-overflowing-*]` in base.css), which lets every
// scroll surface share one custom-thumb implementation instead of falling back
// to a native scrollbar to dodge the phantom.
const OVERFLOW_TOLERANCE = 1;

interface ScrollMetrics {
  scrollHeight: number;
  clientHeight: number;
  scrollWidth: number;
  clientWidth: number;
}

export function getScrollOverflow(metrics: ScrollMetrics) {
  return {
    x: metrics.scrollWidth - metrics.clientWidth > OVERFLOW_TOLERANCE,
    y: metrics.scrollHeight - metrics.clientHeight > OVERFLOW_TOLERANCE,
  };
}

type ScrollAreaProps = React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {
  scrollbarProps?: React.ComponentProps<typeof ScrollAreaPrimitive.Scrollbar>;
  viewportProps?: React.ComponentProps<typeof ScrollAreaPrimitive.Viewport>;
  viewportRef?: React.Ref<HTMLDivElement>;
};

function ScrollArea({
  className,
  children,
  scrollbarProps,
  viewportProps,
  viewportRef,
  ...props
}: ScrollAreaProps) {
  const { className: viewportClassName, ...viewportRest } = viewportProps ?? {};
  const internalViewportRef = React.useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = React.useState({ x: false, y: false });

  const setViewportRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      internalViewportRef.current = node;
      if (typeof viewportRef === "function") {
        viewportRef(node);
      } else if (viewportRef) {
        (viewportRef as React.MutableRefObject<HTMLDivElement | null>).current =
          node;
      }
    },
    [viewportRef],
  );

  // Track real overflow ourselves so the shared scrollbar styling can hide the
  // thumb when content fits. ResizeObserver fires on both viewport and content
  // size changes; the content wrapper is Base UI's direct child of the viewport.
  React.useEffect(() => {
    const viewport = internalViewportRef.current;
    if (!viewport) {
      return;
    }

    const update = () => {
      const next = getScrollOverflow(viewport);
      setOverflow((prev) =>
        prev.x === next.x && prev.y === next.y ? prev : next,
      );
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    const content = viewport.firstElementChild;
    if (content) {
      observer.observe(content);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      data-overflowing-x={overflow.x ? "" : undefined}
      data-overflowing-y={overflow.y ? "" : undefined}
      className={cn(
        "scrollbar-interactive relative overflow-hidden",
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        ref={setViewportRef}
        className={cn(
          "scrollbar-hide scrollbar-native-gutter size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1",
          viewportClassName,
        )}
        {...viewportRest}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar {...scrollbarProps} />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Scrollbar>) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        "flex touch-none p-0 transition-colors select-none data-[orientation=horizontal]:h-2 data-[orientation=horizontal]:flex-col data-[orientation=horizontal]:border-t data-[orientation=horizontal]:border-t-transparent data-[orientation=vertical]:h-full data-[orientation=vertical]:w-2 data-[orientation=vertical]:border-s data-[orientation=vertical]:border-s-transparent",
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full [background:var(--scrollbar-thumb)]"
      />
    </ScrollAreaPrimitive.Scrollbar>
  );
}

export { ScrollArea, ScrollBar };
