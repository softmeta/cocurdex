import type { SessionStatus } from "@cocurdex/shared";
import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useLayoutEffect,
} from "react";
import type { UserMessageAnchor } from "./chat-user-navigation";

interface ChatBottomStickOptions {
  chatContentRef: RefObject<HTMLDivElement | null>;
  isRunning: boolean;
  setInitialBottomSettled: Dispatch<SetStateAction<boolean>>;
  status: SessionStatus | undefined;
  stickToBottomIfLocked(): void;
  stickyUserMessages: UserMessageAnchor[];
  syncScrollState(stickyUserMessages: UserMessageAnchor[]): void;
  timelineGroupCount: number;
  viewportRef: RefObject<HTMLDivElement | null>;
}

export function useChatBottomStick({
  chatContentRef,
  isRunning,
  setInitialBottomSettled,
  status,
  stickToBottomIfLocked,
  stickyUserMessages,
  syncScrollState,
  timelineGroupCount,
  viewportRef,
}: ChatBottomStickOptions) {
  useLayoutEffect(() => {
    if (timelineGroupCount === 0) {
      return;
    }

    stickToBottomIfLocked();
    const frameId = requestAnimationFrame(() => {
      stickToBottomIfLocked();
      setInitialBottomSettled(true);
    });

    return () => cancelAnimationFrame(frameId);
  }, [setInitialBottomSettled, stickToBottomIfLocked, timelineGroupCount]);

  // Content-size growth (streaming deltas, new messages, tool calls, plan
  // panel updates) is handled by the ResizeObserver attached to chatContent
  // below. We only re-stick on transitions that flip layout-relevant state
  // *without* a corresponding box-size change — namely `isRunning` going
  // false (activity line removal swaps inline indicators) and `status`
  // transitions. Keying on content length / updatedAt was the hot path
  // during streaming and is intentionally dropped.
  // biome-ignore lint/correctness/useExhaustiveDependencies: isRunning and status are the re-stick triggers
  useLayoutEffect(() => {
    if (timelineGroupCount === 0) {
      return;
    }
    stickToBottomIfLocked();
  }, [isRunning, status, stickToBottomIfLocked, timelineGroupCount]);

  useLayoutEffect(() => {
    syncScrollState(stickyUserMessages);
  }, [stickyUserMessages, syncScrollState]);

  useLayoutEffect(() => {
    const chatContent = chatContentRef.current;
    const viewport = viewportRef.current;
    if (!chatContent || !viewport || typeof ResizeObserver === "undefined") {
      return;
    }

    // Scroll synchronously inside the observer callback. ResizeObserver
    // callbacks fire after layout but before paint, so adjusting scrollTop
    // here is invisible to the user. Deferring to RAF caused the browser to
    // paint one frame with stale scrollTop against new content height, which
    // showed up as a visible jump — most pronounced when the last message
    // contained a tall code block. viewport.scrollTo does not resize either
    // observed box, so this cannot loop.
    const observer = new ResizeObserver(() => {
      stickToBottomIfLocked();
    });

    // chatContent covers content growth (streaming deltas, new messages).
    // The viewport covers the opposite case: content stays put while the box
    // shrinks or grows around it — the composer dock changing height (task
    // panel appearing, collapsing, dismissed; permission cards; multi-line
    // input) or the window being resized.
    observer.observe(chatContent);
    observer.observe(viewport);
    return () => {
      observer.disconnect();
    };
  }, [chatContentRef, stickToBottomIfLocked, viewportRef]);
}
