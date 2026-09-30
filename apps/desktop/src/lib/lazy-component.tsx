import {
  type ComponentType,
  type ReactNode,
  useSyncExternalStore,
} from "react";

type LoadState<P> =
  | { status: "pending" }
  | { status: "loaded"; component: ComponentType<P> }
  | { status: "failed"; error: unknown };

export function lazyComponent<P extends object>(
  load: () => Promise<ComponentType<P>>,
  fallback: ReactNode = null,
): ComponentType<P> {
  let state: LoadState<P> = { status: "pending" };
  let started = false;
  const listeners = new Set<() => void>();

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    if (!started) {
      started = true;
      void load()
        .then(
          (component) => {
            state = { status: "loaded", component };
          },
          (error: unknown) => {
            state = { status: "failed", error };
          },
        )
        .then(() => {
          for (const notify of listeners) notify();
        });
    }
    return () => {
      listeners.delete(listener);
    };
  };
  const getState = () => state;

  return function LazyComponent(props: P) {
    const current = useSyncExternalStore(subscribe, getState, getState);
    if (current.status === "failed") throw current.error;
    if (current.status === "pending") return fallback;
    const Loaded = current.component;
    return <Loaded {...props} />;
  };
}
