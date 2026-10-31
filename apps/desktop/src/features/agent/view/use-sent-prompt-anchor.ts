import { useCallback, useLayoutEffect, useRef, useState } from "react";

export function useSentPromptAnchor({
  awaitingReplyOnMount,
  latestPromptId,
  scrollToUserMessage,
}: {
  awaitingReplyOnMount: boolean;
  latestPromptId: string | null;
  scrollToUserMessage(messageId: string): void;
}) {
  const [anchoredPromptId, setAnchoredPromptId] = useState<string | null>(null);
  const latestPromptIdRef = useRef(latestPromptId);
  const sentAfterPromptIdRef = useRef<string | null | undefined>(
    awaitingReplyOnMount ? null : undefined,
  );

  const anchorNextPrompt = useCallback(() => {
    sentAfterPromptIdRef.current = latestPromptIdRef.current;
  }, []);

  useLayoutEffect(() => {
    latestPromptIdRef.current = latestPromptId;
    const sentAfter = sentAfterPromptIdRef.current;
    if (
      sentAfter === undefined ||
      !latestPromptId ||
      latestPromptId === sentAfter
    ) {
      return;
    }
    sentAfterPromptIdRef.current = undefined;
    setAnchoredPromptId(latestPromptId);
    scrollToUserMessage(latestPromptId);
  }, [latestPromptId, scrollToUserMessage]);

  return { anchoredPromptId, anchorNextPrompt };
}
