import {
  type EffectCallback,
  type RefObject,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";

// Runs an effect exactly once on mount. The only sanctioned direct `useEffect`
// seam for true mount-time external-system setup (data fetch, subscription,
// DOM/widget wiring). Components call this instead of `useEffect(fn, [])` so
// the "this is mount-only, not dependency sync" intent stays explicit.
export function useMountEffect(effect: EffectCallback) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: this hook intentionally models keyed mount/unmount, not dependency sync
  useEffect(effect, []);
}

// Returns a ref that scrolls its node into view whenever `active` turns true,
// keeping the active tab/item visible when selection moves or a sibling is
// added while the row is scrolled. Sanctioned `useEffect` seam: syncing scroll
// position (an external overflow container) to the derived `active` flag.
export function useScrollIntoViewWhenActive<T extends HTMLElement>(
  active: boolean,
): RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (active) {
      ref.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [active]);
  return ref;
}

// Subscribes a handler to a `document`-level event for the component's lifetime.
// Sanctioned `useEffect` seam for events that only fire on `document` (e.g.
// `selectionchange`) and have no element-level equivalent. Pass a stable
// `handler` (memoized) to avoid needless re-subscription.
export function useDocumentEvent<K extends keyof DocumentEventMap>(
  type: K,
  handler: (event: DocumentEventMap[K]) => void,
) {
  useEffect(() => {
    document.addEventListener(type, handler);
    return () => document.removeEventListener(type, handler);
  }, [type, handler]);
}

// Module-level so the reference is stable across renders; otherwise
// `useSyncExternalStore` would disconnect and re-observe on every commit.
function subscribeResolvedTheme(callback: () => void) {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.attributeName === "data-theme") {
        callback();
        return;
      }
    }
  });
  observer.observe(document.documentElement, { attributes: true });
  return () => observer.disconnect();
}

function getResolvedThemeSnapshot() {
  return document.documentElement.dataset.theme ?? "dark";
}

function getResolvedThemeServerSnapshot() {
  return "dark";
}

// The resolved app theme from the `data-theme` attribute app-shell keeps in
// sync on <html> (Monaco, git diff view, and toasts all follow it).
export function useResolvedTheme() {
  return useSyncExternalStore(
    subscribeResolvedTheme,
    getResolvedThemeSnapshot,
    getResolvedThemeServerSnapshot,
  );
}
