import type { RefObject } from "react";
import { matchesShortcut, useDocumentEvent } from "@/lib";

const FOCUS_SEARCH_COMBO = { key: "f", primary: true } as const;

export function useSettingsSearchShortcut(
  inputRef: RefObject<HTMLInputElement | null>,
) {
  useDocumentEvent("keydown", (event) => {
    if (event.defaultPrevented || !matchesShortcut(event, FOCUS_SEARCH_COMBO)) {
      return;
    }
    const input = inputRef.current;
    if (!input) return;
    event.preventDefault();
    input.focus();
    input.select();
  });
}
