import { useMemo } from "react";
import { type ShortcutDescriptor, useGlobalShortcuts } from "@/lib";

function focusIsInPopup(): boolean {
  const active = document.activeElement;
  return (
    active instanceof HTMLElement &&
    active.closest("[role='menu'], [role='listbox'], [role='dialog']") !== null
  );
}

export function useIssueStepShortcuts(
  onPrevious: (() => void) | null,
  onNext: (() => void) | null,
) {
  const shortcuts = useMemo<ShortcutDescriptor[]>(
    () => [
      {
        id: "issue.previous",
        label: "Previous issue",
        combo: { key: "k" },
        enabled: () => onPrevious !== null && !focusIsInPopup(),
        handler: () => onPrevious?.(),
      },
      {
        id: "issue.next",
        label: "Next issue",
        combo: { key: "j" },
        enabled: () => onNext !== null && !focusIsInPopup(),
        handler: () => onNext?.(),
      },
    ],
    [onPrevious, onNext],
  );
  useGlobalShortcuts(shortcuts);
}
