import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

import { parseShortcutCombo, type ShortcutCombo } from "@/lib";

import { isShortcutId, type ShortcutId, shortcutIds } from "./shortcut-catalog";

export const SHORTCUT_OVERRIDES_STORAGE_KEY = "cocurdex.shortcuts.overrides";

/**
 * Partial map of user overrides. Missing key → catalog default.
 * Explicit `null` → action unbound (no key fires it).
 */
export type ShortcutOverrides = Partial<
  Record<ShortcutId, ShortcutCombo | null>
>;

function normalizeOverrides(value: unknown): ShortcutOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const result: ShortcutOverrides = {};
  for (const [rawId, rawCombo] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (!isShortcutId(rawId)) {
      continue;
    }
    if (rawCombo === null) {
      result[rawId] = null;
      continue;
    }
    const combo = parseShortcutCombo(rawCombo);
    if (combo) {
      result[rawId] = combo;
    }
  }
  return result;
}

const storedShortcutOverridesAtom = atomWithStorage<ShortcutOverrides>(
  SHORTCUT_OVERRIDES_STORAGE_KEY,
  {},
  {
    getItem(key, initialValue) {
      if (typeof window === "undefined") {
        return initialValue;
      }
      const raw = window.localStorage.getItem(key);
      if (raw == null) {
        return initialValue;
      }
      try {
        return normalizeOverrides(JSON.parse(raw));
      } catch {
        return initialValue;
      }
    },
    setItem(key, value) {
      if (typeof window === "undefined") {
        return;
      }
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    removeItem(key) {
      if (typeof window === "undefined") {
        return;
      }
      window.localStorage.removeItem(key);
    },
  },
);

export const shortcutOverridesAtom = atom(
  (get) => normalizeOverrides(get(storedShortcutOverridesAtom)),
  (_get, set, next: ShortcutOverrides) => {
    set(storedShortcutOverridesAtom, normalizeOverrides(next));
  },
);

/** True while the settings recorder is capturing a key chord. */
export const shortcutRecordingIdAtom = atom<ShortcutId | null>(null);

export function setShortcutOverride(
  overrides: ShortcutOverrides,
  id: ShortcutId,
  combo: ShortcutCombo | null,
): ShortcutOverrides {
  return { ...overrides, [id]: combo };
}

export function clearShortcutOverride(
  overrides: ShortcutOverrides,
  id: ShortcutId,
): ShortcutOverrides {
  if (!Object.hasOwn(overrides, id)) {
    return overrides;
  }
  const next = { ...overrides };
  delete next[id];
  return next;
}

export function resetAllShortcutOverrides(): ShortcutOverrides {
  return {};
}

/** Known ids used when pruning stale stored keys after catalog changes. */
export function pruneShortcutOverrides(
  overrides: ShortcutOverrides,
): ShortcutOverrides {
  const next: ShortcutOverrides = {};
  for (const id of shortcutIds) {
    if (Object.hasOwn(overrides, id)) {
      next[id] = overrides[id] ?? null;
    }
  }
  return next;
}
