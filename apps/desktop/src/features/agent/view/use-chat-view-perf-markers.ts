import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";
import { isPerfEnabled, markSessionSwitch, measureSessionSwitch } from "@/lib";

interface ChatViewPerfMarkersParams {
  perfSessionId: string | null;
  renderStartedAt: number;
  messageCount: number;
  conversationCount: number;
  toolCallCount: number;
  viewportRef: RefObject<HTMLDivElement | null>;
  isNearBottom: boolean;
  navigationMessageCount: number;
  isInitialBottomSettled: boolean;
  shouldShowJumpToLatest: boolean;
}

export function useChatViewPerfMarkers({
  perfSessionId,
  renderStartedAt,
  messageCount,
  conversationCount,
  toolCallCount,
  viewportRef,
  isNearBottom,
  navigationMessageCount,
  isInitialBottomSettled,
  shouldShowJumpToLatest,
}: ChatViewPerfMarkersParams) {
  const firstFrameSessionRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (!isPerfEnabled() || !perfSessionId) {
      return;
    }

    markSessionSwitch(perfSessionId, "chat-view-commit", {
      messageCount,
      renderedConversationCount: conversationCount,
      renderToCommitMs: Math.round(performance.now() - renderStartedAt),
      toolCallCount,
      totalConversationCount: conversationCount,
    });
    measureSessionSwitch(
      perfSessionId,
      "click-to-chat-view-commit",
      "click",
      "chat-view-commit",
    );
    measureSessionSwitch(
      perfSessionId,
      "load-end-to-chat-view-commit",
      "transcript-load-end",
      "chat-view-commit",
    );
  }, [
    conversationCount,
    messageCount,
    perfSessionId,
    renderStartedAt,
    toolCallCount,
  ]);

  useEffect(() => {
    if (
      !isPerfEnabled() ||
      !perfSessionId ||
      firstFrameSessionRef.current === perfSessionId
    ) {
      return;
    }

    const frameId = requestAnimationFrame(() => {
      firstFrameSessionRef.current = perfSessionId;
      markSessionSwitch(perfSessionId, "first-frame", {
        messageCount,
        renderedConversationCount: conversationCount,
        renderToFrameMs: Math.round(performance.now() - renderStartedAt),
        toolCallCount,
        totalConversationCount: conversationCount,
      });
      measureSessionSwitch(
        perfSessionId,
        "click-to-first-frame",
        "click",
        "first-frame",
      );
      measureSessionSwitch(
        perfSessionId,
        "load-end-to-first-frame",
        "transcript-load-end",
        "first-frame",
      );
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [
    conversationCount,
    messageCount,
    perfSessionId,
    renderStartedAt,
    toolCallCount,
  ]);

  useEffect(() => {
    if (!isPerfEnabled() || !perfSessionId) {
      return;
    }

    const viewport = viewportRef.current;
    markSessionSwitch(perfSessionId, "scroll-snapshot", {
      navigationMessageCount,
      nearBottom: isNearBottom,
      scrollHeight: viewport?.scrollHeight ?? null,
      scrollTop: viewport?.scrollTop ?? null,
      totalConversationCount: conversationCount,
    });
  }, [
    conversationCount,
    isNearBottom,
    navigationMessageCount,
    perfSessionId,
    viewportRef,
  ]);

  useEffect(() => {
    if (!isPerfEnabled() || !perfSessionId) {
      return;
    }

    markSessionSwitch(perfSessionId, "jump-to-latest-visibility", {
      initialBottomSettled: isInitialBottomSettled,
      nearBottom: isNearBottom,
      shown: shouldShowJumpToLatest,
      totalConversationCount: conversationCount,
    });
  }, [
    conversationCount,
    isInitialBottomSettled,
    isNearBottom,
    perfSessionId,
    shouldShowJumpToLatest,
  ]);
}
