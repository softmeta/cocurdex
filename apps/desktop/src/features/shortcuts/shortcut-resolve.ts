import { type ShortcutCombo, shortcutCombosEqual } from "@/lib";

import {
  getShortcutDefinition,
  SHORTCUT_CATALOG,
  type ShortcutId,
  shortcutIds,
} from "./shortcut-catalog";
import type { ShortcutOverrides } from "./shortcut-store";

/**
 * Effective binding for one action: override when the id is present in
 * overrides (including explicit null = unbound), otherwise the catalog default.
 */
export function resolveShortcutCombo(
  id: ShortcutId,
  overrides: ShortcutOverrides,
): ShortcutCombo | null {
  if (Object.hasOwn(overrides, id)) {
    return overrides[id] ?? null;
  }
  return getShortcutDefinition(id)?.defaultCombo ?? null;
}

export function resolveAllShortcutCombos(
  overrides: ShortcutOverrides,
): Record<ShortcutId, ShortcutCombo | null> {
  const result = {} as Record<ShortcutId, ShortcutCombo | null>;
  for (const id of shortcutIds) {
    result[id] = resolveShortcutCombo(id, overrides);
  }
  return result;
}

export function isShortcutCustomized(
  id: ShortcutId,
  overrides: ShortcutOverrides,
): boolean {
  if (!Object.hasOwn(overrides, id)) {
    return false;
  }
  const definition = getShortcutDefinition(id);
  if (!definition) {
    return true;
  }
  return !shortcutCombosEqual(overrides[id] ?? null, definition.defaultCombo);
}

export interface ShortcutConflict {
  id: ShortcutId;
  conflictsWith: ShortcutId[];
}

/** Pairs of actions that share the same non-null combo. */
export function findShortcutConflicts(
  overrides: ShortcutOverrides,
): ShortcutConflict[] {
  const resolved = resolveAllShortcutCombos(overrides);
  const bySerialized = new Map<string, ShortcutId[]>();

  for (const id of shortcutIds) {
    const combo = resolved[id];
    if (!combo) {
      continue;
    }
    const key = [
      combo.primary ? "1" : "0",
      combo.alt ? "1" : "0",
      combo.shift ? "1" : "0",
      combo.key.toLowerCase(),
    ].join("|");
    const list = bySerialized.get(key) ?? [];
    list.push(id);
    bySerialized.set(key, list);
  }

  const conflicts: ShortcutConflict[] = [];
  for (const ids of bySerialized.values()) {
    if (ids.length < 2) {
      continue;
    }
    for (const id of ids) {
      conflicts.push({
        id,
        conflictsWith: ids.filter((other) => other !== id),
      });
    }
  }
  return conflicts;
}

export function hasAnyShortcutOverrides(overrides: ShortcutOverrides): boolean {
  return SHORTCUT_CATALOG.some((definition) =>
    isShortcutCustomized(definition.id, overrides),
  );
}
