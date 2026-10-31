import type { SessionStatus } from "@cocurdex/shared";
import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useLayoutEffect,
} from "react";
import type { UserMessageAnchor } from "./chat-user-navigation";
import type { ChatTimelineScrollHandle } from "./virtual-timeline";

interface ChatBottomStickOptions {
  chatContentRef: RefObject<HTMLDivElement | null>;
  isContentReady: boolean;
  isContentReadyNow(): boolean;
  isRunning: boolean;
  setInitialBottomSettled: Dispatch<SetStateAction<boolean>>;
  status: SessionStatus | undefined;
  syncViewportLayout(): void;
  finishInitialPositioning(): void;
  stickyUserMessages: UserMessageAnchor[];
  syncScrollState(stickyUserMessages: UserMessageAnchor[]): void;
  timelineGroupCount: number;
  timelineScrollRef: RefObject<ChatTimelineScrollHandle | null>;
  viewportRef: RefObject<HTMLDivElement | null>;
}

export function useChatBottomStick({
  chatContentRef,
  isContentReady,
  isContentReadyNow,
  isRunning,
  setInitialBottomSettled,
  status,
  syncViewportLayout,
  finishInitialPositioning,
  stickyUserMessages,
  syncScrollState,
  timelineGroupCount,
  timelineScrollRef,
  viewportRef,
}: ChatBottomStickOptions) {
  useLayoutEffect(() => {
    if (timelineGroupCount === 0 || !isContentReady) {
      return;
    }

    let isSettled = false;
    let frameId: number | null = null;
    const settle = () => {
      if (isSettled) return;
      isSettled = true;
      if (frameId !== null) cancelAnimationFrame(frameId);
      finishInitialPositioning();
      setInitialBottomSettled(true);
    };
    syncViewportLayout();
    const cancelReveal = timelineScrollRef.current?.revealWhenSettled(
      syncViewportLayout,
      () => {
        if (isContentReadyNow()) settle();
      },
    );
    if (!isSettled) {
      frameId = requestAnimationFrame(() => {
        cancelReveal?.();
        syncViewportLayout();
        settle();
      });
    }

    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      cancelReveal?.();
    };
  }, [
    finishInitialPositioning,
    isContentReady,
    isContentReadyNow,
    setInitialBottomSettled,
    syncViewportLayout,
    timelineGroupCount,
    timelineScrollRef,
  ]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: isRunning and status refresh layout state
  useLayoutEffect(() => {
    if (timelineGroupCount === 0) {
      return;
    }
    syncViewportLayout();
  }, [isRunning, status, syncViewportLayout, timelineGroupCount]);

  useLayoutEffect(() => {
    syncScrollState(stickyUserMessages);
  }, [stickyUserMessages, syncScrollState]);

  useLayoutEffect(() => {
    const chatContent = chatContentRef.current;
    const viewport = viewportRef.current;
    if (
      !chatContent ||
      !viewport ||
      timelineGroupCount === 0 ||
      typeof ResizeObserver === "undefined"
    ) {
      return;
    }

    const observer = new ResizeObserver(() => {
      syncViewportLayout();
    });

    observer.observe(chatContent);
    observer.observe(viewport);
    const contentEnd = chatContent.querySelector(
      "[data-transcript-content-end]",
    );
    if (contentEnd) observer.observe(contentEnd);
    return () => {
      observer.disconnect();
    };
  }, [chatContentRef, syncViewportLayout, viewportRef, timelineGroupCount]);
}
