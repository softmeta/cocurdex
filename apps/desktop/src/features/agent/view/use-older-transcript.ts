import { useAtomValue, useSetAtom } from "jotai";
import { type RefObject, useCallback } from "react";
import {
  loadOlderTranscriptAtom,
  sessionHasOlderTranscriptAtom,
} from "./transcript-window";
import type { ChatTimelineScrollHandle } from "./virtual-timeline";

function reportLoadFailure(sessionId: string) {
  return (error: unknown) => {
    console.error("[ChatView] load older transcript failed", {
      error,
      sessionId,
    });
  };
}

export function useOlderTranscriptLoader(
  sessionId: string | null | undefined,
  scrollRef: RefObject<ChatTimelineScrollHandle | null>,
) {
  const hasOlder = useAtomValue(sessionHasOlderTranscriptAtom);
  const loadOlder = useSetAtom(loadOlderTranscriptAtom);
  const loadNearTop = useCallback(
    (viewport: HTMLDivElement | null) => {
      if (!sessionId || !viewport || !hasOlder(sessionId)) return;
      if (viewport.scrollTop > viewport.clientHeight) return;
      loadOlder({
        sessionId,
        beforeApply: () => scrollRef.current?.keepPositionAcrossPrepend(),
      }).catch(reportLoadFailure(sessionId));
    },
    [hasOlder, loadOlder, scrollRef, sessionId],
  );
  const loadAllThen = useCallback(
    (onLoaded: () => void) => {
      if (!sessionId || !hasOlder(sessionId)) {
        onLoaded();
        return;
      }
      loadOlder({ sessionId, all: true, beforeApply: () => {} })
        .then(onLoaded)
        .catch(reportLoadFailure(sessionId));
    },
    [hasOlder, loadOlder, sessionId],
  );
  return { loadNearTop, loadAllThen };
}
