import { type ComponentProps, useCallback, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui";
import { cn, useMountEffect } from "@/lib";
import { SidebarScrollingContext } from "./sidebar-scrolling";

const SCROLL_IDLE_MS = 150;

type SidebarScrollAreaProps = ComponentProps<typeof ScrollArea>;

type ViewportScrollEvent = Parameters<
  NonNullable<NonNullable<SidebarScrollAreaProps["viewportProps"]>["onScroll"]>
>[0];

export function SidebarScrollArea({
  className,
  viewportProps,
  ...props
}: SidebarScrollAreaProps) {
  const [scrolling, setScrolling] = useState(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleScroll = useCallback(
    (event: ViewportScrollEvent) => {
      viewportProps?.onScroll?.(event);
      setScrolling(true);
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(
        () => setScrolling(false),
        SCROLL_IDLE_MS,
      );
    },
    [viewportProps],
  );

  useMountEffect(() => () => clearTimeout(idleTimerRef.current));

  return (
    <SidebarScrollingContext.Provider value={scrolling}>
      <ScrollArea
        className={cn("-ms-3", className)}
        viewportProps={{
          ...viewportProps,
          className: cn("[&>*]:ps-3", viewportProps?.className),
          onScroll: handleScroll,
        }}
        {...props}
      />
    </SidebarScrollingContext.Provider>
  );
}
