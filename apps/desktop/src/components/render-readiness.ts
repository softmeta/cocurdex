import {
  createContext,
  use,
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from "react";

export interface RenderReadiness {
  hold(): () => void;
  isReady(): boolean;
  subscribe(listener: () => void): () => void;
}

export function createRenderReadiness(): RenderReadiness {
  let holds = 0;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    hold() {
      holds += 1;
      if (holds === 1) notify();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        holds -= 1;
        if (holds === 0) notify();
      };
    },
    isReady: () => holds === 0,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const RenderReadinessContext = createContext<RenderReadiness | null>(
  null,
);

export function useRenderReadinessHold(pending: boolean) {
  const readiness = use(RenderReadinessContext);
  useLayoutEffect(() => {
    if (!pending || !readiness) return;
    return readiness.hold();
  }, [pending, readiness]);
}

export function useRenderReadiness(
  readiness: RenderReadiness,
  deadlineMs: number,
) {
  const isReady = useSyncExternalStore(
    readiness.subscribe,
    readiness.isReady,
    readiness.isReady,
  );
  const [isExpired, setIsExpired] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setIsExpired(true), deadlineMs);
    return () => clearTimeout(timer);
  }, [deadlineMs]);
  return isReady || isExpired;
}
