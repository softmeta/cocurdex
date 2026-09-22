import {
  type ComponentProps,
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { ScrollArea } from "@/components/ui";
import { useMountEffect } from "@/lib";

const SCROLL_IDLE_MS = 150;

const SidebarScrollingContext = createContext(false);

export function useSidebarScrolling() {
  return useContext(SidebarScrollingContext);
}

type SidebarScrollAreaProps = ComponentProps<typeof ScrollArea>;

type ViewportScrollEvent = Parameters<
  NonNullable<NonNullable<SidebarScrollAreaProps["viewportProps"]>["onScroll"]>
>[0];

export function SidebarScrollArea({
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
        viewportProps={{ ...viewportProps, onScroll: handleScroll }}
        {...props}
      />
    </SidebarScrollingContext.Provider>
  );
}
