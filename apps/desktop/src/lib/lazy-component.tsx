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
): ComponentType<P> & { preload(): Promise<void> } {
  let state: LoadState<P> = { status: "pending" };
  let loading: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  const preload = () => {
    loading ??= load()
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
    return loading;
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    void preload();
    return () => {
      listeners.delete(listener);
    };
  };
  const getState = () => state;

  function LazyComponent(props: P) {
    const current = useSyncExternalStore(subscribe, getState, getState);
    if (current.status === "failed") throw current.error;
    if (current.status === "pending") return fallback;
    const Loaded = current.component;
    return <Loaded {...props} />;
  }
  return Object.assign(LazyComponent, { preload });
}
