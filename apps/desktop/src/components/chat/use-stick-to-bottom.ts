import {
  type RefCallback,
  type RefObject,
  useCallback,
  useRef,
  useState,
} from "react";
import { type JumpButtonKind, resolveJumpButton } from "./jump-button";

// Matches agent chat's near-edge threshold so both surfaces feel consistent.
export const STICK_TO_BOTTOM_THRESHOLD = 96;
const USER_SCROLL_INTENT_WINDOW_MS = 600;

export function isScrollNearBottom(
  scrollHeight: number,
  clientHeight: number,
  scrollTop: number,
  threshold = STICK_TO_BOTTOM_THRESHOLD,
): boolean {
  return scrollHeight - clientHeight - scrollTop <= threshold;
}

export function isScrollNearTop(
  scrollTop: number,
  threshold = STICK_TO_BOTTOM_THRESHOLD,
): boolean {
  return scrollTop <= threshold;
}

// Pure lock transition used by the scroll handler. Near-bottom re-engages;
// a recent user gesture unlocks; otherwise the current lock is preserved
// (so programmatic stick scrolls do not thrash the flag).
//
// `suppressBottomRelock` covers programmatic jump-to-top (smooth scroll): the
// viewport starts near the bottom and would otherwise re-arm the lock on the
// first few scroll frames, after which ResizeObserver / layout stick yanks
// the view back down mid-animation.
export function nextShouldStickToBottom({
  currentlyStick,
  nearBottom,
  hasRecentUserScrollIntent,
  suppressBottomRelock = false,
}: {
  currentlyStick: boolean;
  nearBottom: boolean;
  hasRecentUserScrollIntent: boolean;
  suppressBottomRelock?: boolean;
}): boolean {
  if (suppressBottomRelock) {
    return false;
  }
  if (nearBottom) {
    return true;
  }
  if (hasRecentUserScrollIntent) {
    return false;
  }
  return currentlyStick;
}

function elementIsNearBottom(el: HTMLElement): boolean {
  return isScrollNearBottom(el.scrollHeight, el.clientHeight, el.scrollTop);
}

function elementIsNearTop(el: HTMLElement): boolean {
  return isScrollNearTop(el.scrollTop);
}

/**
 * Pin a scroll viewport to its bottom while the viewer is "following" the
 * stream. Unlocks when the user scrolls up, re-locks near the bottom, and
 * exposes jump-button state matching agent chat's `resolveJumpButton`.
 */
export function useStickToBottom(viewportRef: RefObject<HTMLElement | null>) {
  const shouldStickToBottomRef = useRef(true);
  const userScrollIntentTsRef = useRef(0);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const stickToBottomIfLockedRef = useRef<() => void>(() => {});
  const lastScrollTopRef = useRef(0);
  // While a smooth jump-to-top is in flight, suppress near-bottom re-lock so
  // ResizeObserver stick cannot yank the viewport back down mid-animation.
  const autoScrollTargetRef = useRef<"top" | "bottom" | null>(null);

  const [isNearBottom, setIsNearBottom] = useState(true);
  const [isNearTop, setIsNearTop] = useState(true);
  const [hasUserScrolled, setHasUserScrolled] = useState(false);
  const [scrollDirection, setScrollDirection] = useState<"up" | "down">("down");
  const [isReady, setIsReady] = useState(false);

  const endAutoScroll = useCallback(() => {
    autoScrollTargetRef.current = null;
  }, []);

  const scrollToLatest = useCallback(
    (behavior: ScrollBehavior = "auto") => {
      const el = viewportRef.current;
      if (!el) {
        return;
      }
      const nextTop = el.scrollHeight;
      if (behavior === "smooth") {
        autoScrollTargetRef.current = "bottom";
      } else {
        endAutoScroll();
      }
      if (typeof el.scrollTo === "function") {
        el.scrollTo({ behavior, top: nextTop });
      } else {
        el.scrollTop = nextTop;
      }
      shouldStickToBottomRef.current = true;
      setIsNearBottom(true);
      setIsNearTop(
        el.scrollHeight <= el.clientHeight + STICK_TO_BOTTOM_THRESHOLD,
      );
    },
    [endAutoScroll, viewportRef],
  );

  const scrollToTop = useCallback(
    (behavior: ScrollBehavior = "auto") => {
      const el = viewportRef.current;
      if (!el) {
        return;
      }
      shouldStickToBottomRef.current = false;
      if (behavior === "smooth") {
        autoScrollTargetRef.current = "top";
      } else {
        endAutoScroll();
      }
      if (typeof el.scrollTo === "function") {
        el.scrollTo({ behavior, top: 0 });
      } else {
        el.scrollTop = 0;
      }
      setIsNearBottom(false);
      setIsNearTop(true);
    },
    [endAutoScroll, viewportRef],
  );

  const stickToBottomIfLocked = useCallback(() => {
    if (!shouldStickToBottomRef.current) {
      return;
    }
    if (autoScrollTargetRef.current === "top") {
      return;
    }
    scrollToLatest("auto");
  }, [scrollToLatest]);

  stickToBottomIfLockedRef.current = stickToBottomIfLocked;

  // Force-follow on a new user turn (send / edit / retry). Safe before paint —
  // ResizeObserver will stick once height grows.
  const reengageStick = useCallback(() => {
    shouldStickToBottomRef.current = true;
    scrollToLatest("auto");
  }, [scrollToLatest]);

  const markUserScrollStart = useCallback(() => {
    userScrollIntentTsRef.current = performance.now();
    shouldStickToBottomRef.current = false;
    endAutoScroll();
    setHasUserScrolled(true);
  }, [endAutoScroll]);

  const markUserScrollIntent = useCallback(() => {
    userScrollIntentTsRef.current = performance.now();
    setHasUserScrolled(true);
    endAutoScroll();
    const el = viewportRef.current;
    if (el && !elementIsNearBottom(el)) {
      shouldStickToBottomRef.current = false;
      setIsNearBottom(false);
    }
  }, [endAutoScroll, viewportRef]);

  const syncOnScroll = useCallback(() => {
    const el = viewportRef.current;
    if (!el) {
      return;
    }

    const nextIsNearBottom = elementIsNearBottom(el);
    const nextIsNearTop = elementIsNearTop(el);
    setIsNearBottom(nextIsNearBottom);
    setIsNearTop(nextIsNearTop);

    const scrollTop = el.scrollTop;
    if (scrollTop !== lastScrollTopRef.current) {
      setScrollDirection(scrollTop > lastScrollTopRef.current ? "down" : "up");
      lastScrollTopRef.current = scrollTop;
    }

    const autoScrollTarget = autoScrollTargetRef.current;
    if (
      (autoScrollTarget === "top" && nextIsNearTop) ||
      (autoScrollTarget === "bottom" && nextIsNearBottom)
    ) {
      endAutoScroll();
    }

    shouldStickToBottomRef.current = nextShouldStickToBottom({
      currentlyStick: shouldStickToBottomRef.current,
      nearBottom: nextIsNearBottom,
      hasRecentUserScrollIntent:
        performance.now() - userScrollIntentTsRef.current <
        USER_SCROLL_INTENT_WINDOW_MS,
      suppressBottomRelock: autoScrollTarget === "top",
    });
  }, [endAutoScroll, viewportRef]);

  // Callback ref so ResizeObserver attaches when the content column mounts
  // (chat mode unmounts ScrollArea on the empty state) and detaches cleanly.
  const contentRef = useCallback<RefCallback<HTMLElement>>((node) => {
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
      resizeObserverRef.current = null;
    }

    if (!node || typeof ResizeObserver === "undefined") {
      setIsReady(false);
      return;
    }

    const observer = new ResizeObserver(() => {
      stickToBottomIfLockedRef.current();
    });
    observer.observe(node);
    resizeObserverRef.current = observer;
    stickToBottomIfLockedRef.current();
    setIsReady(true);
  }, []);

  const jumpButton: JumpButtonKind = resolveJumpButton({
    isReady,
    hasUserScrolled,
    isNearTop,
    isNearBottom,
    scrollDirection,
  });

  return {
    contentRef,
    hasUserScrolled,
    isNearBottom,
    isNearTop,
    jumpButton,
    reengageStick,
    scrollDirection,
    scrollToLatest,
    scrollToTop,
    viewportProps: {
      onKeyDownCapture: markUserScrollStart,
      onPointerDown: markUserScrollIntent,
      onPointerDownCapture: markUserScrollIntent,
      onScroll: syncOnScroll,
      onTouchMoveCapture: markUserScrollStart,
      onWheelCapture: markUserScrollStart,
      tabIndex: 0 as const,
    },
  };
}
