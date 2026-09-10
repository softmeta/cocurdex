import { type Range, useVirtualizer } from "@tanstack/react-virtual";
import {
  type RefObject,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { STICK_TO_BOTTOM_RESUME_THRESHOLD } from "@/components/chat";
import {
  getStickyUserMessageIdForConversationIndex,
  isViewportNearBottom,
  resolveStickyUserMessage,
  STICKY_ACTIVE_TOP_OFFSET,
  type StickyUserMessageSelection,
} from "../chat-scroll";
import type { ConversationGroup } from "../chat-timeline";
import { usePinnedConversations } from "./use-pinned-conversations";
import {
  CONVERSATION_ESTIMATED_HEIGHT,
  createConversationLookup,
  getAdjacentPromptIndexes,
  getConversationWindow,
  getMessageScrollTop,
  MESSAGE_SCROLL_INSET,
} from "./virtual-timeline-model";

export interface ChatTimelineScrollHandle {
  cancelNavigation(): void;
  hasNavigationTarget(): boolean;
  getStickySelection(): StickyUserMessageSelection | null;
  scrollToUserMessage(messageId: string): boolean;
}

export function useVirtualTimeline({
  groups,
  scrollRef,
  userMessageRefs,
  viewportElement,
}: {
  groups: ConversationGroup[];
  scrollRef: RefObject<ChatTimelineScrollHandle | null>;
  userMessageRefs: RefObject<Record<string, HTMLDivElement | null>>;
  viewportElement: HTMLDivElement | null;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const [targetId, setTargetId] = useState<string | null>(null);
  const targetRef = useRef<string | null>(null);
  const lookup = useMemo(() => createConversationLookup(groups), [groups]);
  const { focusedId, selectedIds, updateFocus } =
    usePinnedConversations(rootRef);
  const itemKeySignature = JSON.stringify(groups.map((group) => group.id));
  const getItemKey = useMemo(() => {
    const keys: string[] = JSON.parse(itemKeySignature);
    return (index: number) => keys[index];
  }, [itemKeySignature]);
  const rangeExtractor = useCallback(
    (range: Range) => {
      const pinned = [
        groups.length - 1,
        lookup.byMessageId.get(targetId ?? "") ?? -1,
        lookup.byId.get(focusedId ?? "") ?? -1,
      ];
      const start = lookup.byId.get(selectedIds?.[0] ?? "");
      const end = lookup.byId.get(selectedIds?.[1] ?? "");
      const selectedRange: [number, number] | null =
        start !== undefined && end !== undefined ? [start, end] : null;
      return getConversationWindow(range, pinned, selectedRange);
    },
    [focusedId, groups.length, lookup, selectedIds, targetId],
  );
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    anchorTo: "end",
    count: groups.length,
    estimateSize: () => CONVERSATION_ESTIMATED_HEIGHT,
    followOnAppend: true,
    getItemKey,
    getScrollElement: () => viewportElement,
    overscan: 2,
    rangeExtractor,
    scrollEndThreshold: STICK_TO_BOTTOM_RESUME_THRESHOLD,
    scrollMargin,
    scrollPaddingStart: MESSAGE_SCROLL_INSET,
  });
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item) =>
    item.end <= (viewportElement?.scrollTop ?? 0);
  const items = virtualizer.getVirtualItems();

  const correctTargetPosition = useCallback(() => {
    const messageId = targetRef.current;
    const viewport = viewportElement;
    const element = messageId ? userMessageRefs.current[messageId] : null;
    if (!viewport || !element) return;
    const relativeTop =
      element.getBoundingClientRect().top -
      viewport.getBoundingClientRect().top;
    const nextTop = getMessageScrollTop(
      viewport.scrollTop,
      relativeTop,
      viewport.scrollHeight,
      viewport.clientHeight,
    );
    if (Math.abs(nextTop - viewport.scrollTop) > 1)
      viewport.scrollTop = nextTop;
  }, [userMessageRefs, viewportElement]);

  useImperativeHandle(
    scrollRef,
    () => ({
      cancelNavigation() {
        targetRef.current = null;
        setTargetId(null);
      },
      hasNavigationTarget: () => targetRef.current !== null,
      getStickySelection() {
        const viewport = viewportElement;
        if (!viewport) return null;
        const item = virtualizer.getVirtualItemForOffset(
          viewport.scrollTop + STICKY_ACTIVE_TOP_OFFSET,
        );
        if (!item) return null;
        const viewportTop = viewport.getBoundingClientRect().top;
        const candidates = getAdjacentPromptIndexes(
          lookup.promptIndexes,
          item.index,
        ).flatMap((index) => {
          const prompt = groups[index].prompt;
          const measurement = virtualizer.measurementsCache[index];
          if (!prompt || !measurement) return [];
          const element = userMessageRefs.current[prompt.id];
          return [
            {
              id: prompt.id,
              relativeTop: element
                ? element.getBoundingClientRect().top - viewportTop
                : measurement.start - viewport.scrollTop,
            },
          ];
        });
        const lastId = getStickyUserMessageIdForConversationIndex(
          groups,
          groups.length - 1,
        );
        return resolveStickyUserMessage(
          candidates,
          groups[0]?.prompt?.id ?? null,
          {
            atEnd: isViewportNearBottom(viewport),
            lastId,
          },
        );
      },
      scrollToUserMessage(messageId) {
        const index = lookup.byMessageId.get(messageId);
        const viewport = viewportElement;
        if (index === undefined || !viewport) return false;
        targetRef.current = messageId;
        setTargetId(messageId);
        const offset = virtualizer.getOffsetForIndex(index, "start");
        if (offset) viewport.scrollTop = offset[0];
        correctTargetPosition();
        return true;
      },
    }),
    [
      correctTargetPosition,
      groups,
      lookup,
      userMessageRefs,
      viewportElement,
      virtualizer,
    ],
  );

  useLayoutEffect(() => {
    const root = rootRef.current;
    const viewport = viewportElement;
    if (!root || !viewport) return;
    const update = () => {
      const margin =
        root.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top +
        viewport.scrollTop;
      setScrollMargin((current) =>
        Math.abs(current - margin) > 1 ? margin : current,
      );
      correctTargetPosition();
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [correctTargetPosition, viewportElement]);

  useLayoutEffect(() => {
    if (targetId && lookup.byMessageId.has(targetId) && items.length > 0)
      correctTargetPosition();
  }, [correctTargetPosition, lookup, items, targetId]);

  return {
    items,
    rootRef,
    scrollMargin,
    updateFocus,
    virtualizer,
  };
}
