import { useCallback, useSyncExternalStore } from "react";
import { getSystemLocale, type SupportedLocale } from "@/i18n/language";

function getSystemPrefersDark() {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return true;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function useSystemPrefersDark(
  onChange?: (prefersDark: boolean) => void,
) {
  // Memoize so `useSyncExternalStore` doesn't tear down and re-add the
  // matchMedia listener on every render. Caller must pass a stable `onChange`.
  const subscribe = useCallback(
    (notify: () => void) => {
      if (
        typeof window === "undefined" ||
        typeof window.matchMedia !== "function"
      ) {
        return () => {};
      }

      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = (event: MediaQueryListEvent) => {
        onChange?.(event.matches);
        notify();
      };

      mediaQuery.addEventListener("change", handleChange);
      return () => {
        mediaQuery.removeEventListener("change", handleChange);
      };
    },
    [onChange],
  );

  return useSyncExternalStore(subscribe, getSystemPrefersDark, () => true);
}

export function useSystemLocale(
  enabled: boolean,
  onChange?: (locale: SupportedLocale) => void,
) {
  // Memoize so the `languagechange` listener isn't re-added every render.
  // Caller must pass a stable `onChange`.
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!enabled || typeof window === "undefined") {
        return () => {};
      }

      const handleLanguageChange = () => {
        onChange?.(getSystemLocale());
        notify();
      };

      window.addEventListener("languagechange", handleLanguageChange);
      return () => {
        window.removeEventListener("languagechange", handleLanguageChange);
      };
    },
    [enabled, onChange],
  );

  return useSyncExternalStore(subscribe, getSystemLocale, getSystemLocale);
}
