import { getLocalHost } from "./daemon-client";

type SessionStreamListener = (sessionId: string) => void;

const narrowedListeners = new Set<SessionStreamListener>();

export function watchSessionStream(sessionId: string) {
  const watch = getLocalHost().watchSession(sessionId);
  let released = false;
  if (watch.started) {
    void watch.ready.then(() => {
      if (released) return;
      for (const listener of [...narrowedListeners]) listener(sessionId);
    });
  }
  return () => {
    released = true;
    watch.release();
  };
}

export function onSessionStreamResumed(listener: SessionStreamListener) {
  narrowedListeners.add(listener);
  return () => {
    narrowedListeners.delete(listener);
  };
}
