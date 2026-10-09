import { useEffect, useState } from "react";
import { getNextRevealLength } from "./streaming-reveal";

const REVEAL_FRAME_MS = 50;

export function useStreamingReveal(content: string, streaming: boolean) {
  const [revealed, setRevealed] = useState(content.length);
  const [pacing, setPacing] = useState(streaming);
  const shown = Math.min(revealed, content.length);
  const caughtUp = shown >= content.length;

  if (streaming && !pacing) {
    setPacing(true);
  }
  if (!streaming && pacing && caughtUp) {
    setPacing(false);
  }
  if (!streaming && !pacing && revealed !== content.length) {
    setRevealed(content.length);
  }

  useEffect(() => {
    if (!pacing || caughtUp) {
      return;
    }
    const startedAt = performance.now();
    const timer = window.setTimeout(() => {
      setRevealed(
        getNextRevealLength(content, shown, performance.now() - startedAt),
      );
    }, REVEAL_FRAME_MS);
    return () => window.clearTimeout(timer);
  }, [caughtUp, content, pacing, shown]);

  return {
    content: pacing ? content.slice(0, shown) : content,
    live: streaming || !caughtUp,
  };
}
