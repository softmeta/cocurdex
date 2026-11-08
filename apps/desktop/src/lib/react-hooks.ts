import {
  type EffectCallback,
  type RefObject,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";

export function useMountEffect(effect: EffectCallback) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: this hook intentionally models keyed mount/unmount, not dependency sync
  useEffect(effect, []);
}

export function useScrollIntoViewWhenActive<T extends HTMLElement>(
  active: boolean | number,
): RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (active) {
      ref.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [active]);
  return ref;
}

export function useDocumentEvent<K extends keyof DocumentEventMap>(
  type: K,
  handler: (event: DocumentEventMap[K]) => void,
) {
  useEffect(() => {
    document.addEventListener(type, handler);
    return () => document.removeEventListener(type, handler);
  }, [type, handler]);
}

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

export function useResolvedTheme() {
  return useSyncExternalStore(
    subscribeResolvedTheme,
    getResolvedThemeSnapshot,
    getResolvedThemeServerSnapshot,
  );
}
