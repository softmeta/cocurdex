import {
  isScrollNearBottom,
  isScrollNearTop,
  STICK_TO_BOTTOM_RESUME_THRESHOLD,
  STICK_TO_BOTTOM_THRESHOLD,
} from "@/components/chat";

const SCROLL_BOTTOM_THRESHOLD = STICK_TO_BOTTOM_THRESHOLD;
const SCROLL_RESUME_BOTTOM_THRESHOLD = STICK_TO_BOTTOM_RESUME_THRESHOLD;

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
};

export function resolveStickyUserMessage(
  candidates: StickyUserMessageCandidate[],
  fallbackId: string | null,
  options?: { atEnd?: boolean; lastId?: string | null },
): StickyUserMessageSelection {
  if (options?.atEnd) {
    return { id: options.lastId ?? candidates.at(-1)?.id ?? fallbackId };
  }

  let stickyId: string | null = null;
  let stickyTop = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    const { id, relativeTop } = candidate;

    if (relativeTop <= STICKY_ACTIVE_TOP_OFFSET) {
      if (relativeTop >= stickyTop) {
        stickyId = id;
        stickyTop = relativeTop;
      }
      continue;
    }

    if (!stickyId) {
      stickyId = id;
      stickyTop = relativeTop;
    }
  }

  return { id: stickyId ?? fallbackId };
}

export function getTranscriptContentHeight(viewport: HTMLDivElement) {
  const end = viewport.querySelector<HTMLElement>(
    "[data-transcript-content-end]",
  );
  if (!end) return viewport.scrollHeight;
  return Math.max(
    0,
    end.getBoundingClientRect().bottom -
      viewport.getBoundingClientRect().top +
      viewport.scrollTop,
  );
}

export function isViewportNearBottom(viewport: HTMLDivElement) {
  return isScrollNearBottom(
    getTranscriptContentHeight(viewport),
    viewport.clientHeight,
    viewport.scrollTop,
    SCROLL_BOTTOM_THRESHOLD,
  );
}

export function isViewportAtBottom(viewport: HTMLDivElement) {
  return isScrollNearBottom(
    getTranscriptContentHeight(viewport),
    viewport.clientHeight,
    viewport.scrollTop,
    SCROLL_RESUME_BOTTOM_THRESHOLD,
  );
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

export function isDisclosureToggle(target: EventTarget | null) {
  return (
    target instanceof Element &&
    target.closest('[data-slot="collapsible-trigger"]') !== null
  );
}
