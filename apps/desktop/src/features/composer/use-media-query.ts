import { useEffect, useState } from "react";

function matches(query: string) {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }
  return window.matchMedia(query).matches;
}

// External system: matchMedia subscription. Effect is appropriate here because
// we are syncing React state with a browser-provided event source.
export function useMediaQuery(query: string) {
  const [matched, setMatched] = useState(() => matches(query));

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }

    const mediaQuery = window.matchMedia(query);
    setMatched(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      setMatched(event.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, [query]);

  return matched;
}
