import { useAtomValue } from "jotai";
import { useMemo } from "react";

import { formatShortcutLabel, type ShortcutCombo } from "@/lib";

import type { ShortcutId } from "./shortcut-catalog";
import { resolveShortcutCombo } from "./shortcut-resolve";
import { shortcutOverridesAtom } from "./shortcut-store";

/** Current effective combo for a catalog action (default or override). */
export function useResolvedShortcutCombo(id: ShortcutId): ShortcutCombo | null {
  const overrides = useAtomValue(shortcutOverridesAtom);
  return useMemo(() => resolveShortcutCombo(id, overrides), [id, overrides]);
}

export function useResolvedShortcutLabel(id: ShortcutId): string {
  const combo = useResolvedShortcutCombo(id);
  return formatShortcutLabel(combo);
}
