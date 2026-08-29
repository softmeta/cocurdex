import {
  isScrollNearBottom,
  isScrollNearTop,
  STICK_TO_BOTTOM_THRESHOLD,
} from "@/components/chat";

// Re-export so existing agent imports keep working; implementation lives in
// components/chat for pure-chat reuse.
export {
  type JumpButtonKind,
  resolveJumpButton,
} from "@/components/chat";

const SCROLL_BOTTOM_THRESHOLD = STICK_TO_BOTTOM_THRESHOLD;
const SCROLL_ANIMATION_DURATION_MS = 180;
const SCROLL_INITIAL_LEAD_MS = 18;

// A prompt is treated as the active section once its header rises to within
// this distance of the viewport top. Mirrors the side-navigation activation.
export const STICKY_ACTIVE_TOP_OFFSET = 80;

type StickyConversationAnchor = {
  prompt?: { id: string } | null;
};

export type StickyUserMessageCandidate = {
  id: string;
  // Top of the prompt header relative to the scroll viewport top, in pixels.
  // Negative means the header has scrolled above the visible area.
  relativeTop: number;
};

export type StickyUserMessageSelection = {
  id: string | null;
  // Whether the overlay bar should be shown. Only true once the active
  // prompt's real header has scrolled fully above the viewport top, so the
  // bar never duplicates a header that is still on screen.
  pinned: boolean;
};

// Picks which prompt the viewport currently belongs to and whether its header
// has scrolled off the top. Candidates must be ordered top-to-bottom, matching
// their DOM order, so relativeTop increases across the list.
export function resolveStickyUserMessage(
  candidates: StickyUserMessageCandidate[],
  fallbackId: string | null,
): StickyUserMessageSelection {
  let stickyId: string | null = null;
  let stickyTop = Number.NEGATIVE_INFINITY;
  let pinned = false;

  for (const candidate of candidates) {
    const { id, relativeTop } = candidate;

    if (relativeTop <= STICKY_ACTIVE_TOP_OFFSET) {
      // Keep the lowest header that is still at/above the activation line —
      // that is the section the viewer is reading.
      if (relativeTop >= stickyTop) {
        stickyId = id;
        stickyTop = relativeTop;
        pinned = relativeTop < 0;
      }
      continue;
    }

    // No header has crossed the activation line yet; fall back to the first
    // (topmost) prompt and leave the bar hidden — its header is still visible.
    if (!stickyId) {
      stickyId = id;
      stickyTop = relativeTop;
      pinned = false;
    }
  }

  return { id: stickyId ?? fallbackId, pinned: stickyId ? pinned : false };
}

// Re-arming stream-follow after a manual scroll needs a far tighter test than
// the 96px sticky band: inside that band a one-line nudge would hand control
// straight back to autoscroll and yank the viewer down mid-read.
const SCROLL_RESUME_BOTTOM_THRESHOLD = 8;

export function isViewportNearBottom(viewport: HTMLDivElement) {
  return isScrollNearBottom(
    viewport.scrollHeight,
    viewport.clientHeight,
    viewport.scrollTop,
    SCROLL_BOTTOM_THRESHOLD,
  );
}

export function isViewportAtBottom(viewport: HTMLDivElement) {
  return isScrollNearBottom(
    viewport.scrollHeight,
    viewport.clientHeight,
    viewport.scrollTop,
    SCROLL_RESUME_BOTTOM_THRESHOLD,
  );
}

/**
 * Whether the viewport should keep following the stream after a scroll.
 * Manual scrolling outranks following: while the viewer is actively scrolling,
 * only a deliberate return to the very bottom re-arms it.
 */
export function resolveStickToBottom({
  autoScrollTarget,
  hasRecentUserScrollIntent,
  isAtBottom,
  isNearBottom,
  wasSticking,
}: {
  autoScrollTarget: "top" | "bottom" | null;
  hasRecentUserScrollIntent: boolean;
  isAtBottom: boolean;
  isNearBottom: boolean;
  wasSticking: boolean;
}): boolean {
  // Mid jump-to-top the viewport is still near the bottom for a few frames;
  // re-arming there lets layout stick yank it back down.
  if (autoScrollTarget === "top") {
    return false;
  }

  if (hasRecentUserScrollIntent) {
    return isAtBottom;
  }

  return isNearBottom ? true : wasSticking;
}

export function isViewportNearTop(viewport: HTMLDivElement) {
  return isScrollNearTop(viewport.scrollTop, SCROLL_BOTTOM_THRESHOLD);
}

export function getStickyUserMessageIdForConversationIndex(
  conversationGroups: StickyConversationAnchor[],
  conversationIndex: number,
) {
  const startIndex = Math.min(
    Math.max(0, conversationIndex),
    conversationGroups.length - 1,
  );

  for (let index = startIndex; index >= 0; index -= 1) {
    const prompt = conversationGroups[index]?.prompt;

    if (prompt) {
      return prompt.id;
    }
  }

  return null;
}

function easeOutCubic(value: number) {
  return 1 - (1 - value) ** 3;
}

export function animateViewportScroll({
  onComplete,
  onUpdate,
  startTop,
  targetTop,
  viewport,
}: {
  onComplete?(): void;
  onUpdate?(nextTop: number): void;
  startTop: number;
  targetTop: number;
  viewport: HTMLDivElement;
}) {
  if (startTop === targetTop) {
    viewport.scrollTop = targetTop;
    onUpdate?.(targetTop);
    onComplete?.();
    return null;
  }

  const startTime = performance.now();

  const applyScroll = (timestamp: number) => {
    const elapsed = timestamp - startTime;
    const progress = Math.min(1, elapsed / SCROLL_ANIMATION_DURATION_MS);
    const nextTop = startTop + (targetTop - startTop) * easeOutCubic(progress);

    viewport.scrollTop = nextTop;
    onUpdate?.(nextTop);

    return progress;
  };

  const step = (timestamp: number) => {
    const progress = applyScroll(timestamp);

    if (progress < 1) {
      return requestAnimationFrame(step);
    }

    onComplete?.();
    return null;
  };

  applyScroll(startTime + SCROLL_INITIAL_LEAD_MS);
  return requestAnimationFrame(step);
}
