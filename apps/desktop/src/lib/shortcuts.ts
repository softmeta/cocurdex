import { useEffect } from "react";

import { isMacPlatform } from "./platform";

export interface ShortcutCombo {
  key: string;
  primary?: boolean;
  alt?: boolean;
  shift?: boolean;
}

export interface ShortcutDescriptor {
  id: string;
  label: string;
  /** null = unbound / disabled */
  combo: ShortcutCombo | null;
  handler(event: KeyboardEvent): void;
  enabled?(): boolean;
  allowInEditable?: boolean;
}

const MODIFIER_KEYS = new Set([
  "meta",
  "control",
  "ctrl",
  "alt",
  "shift",
  "os",
  "hyper",
  "super",
]);

/** Normalize a KeyboardEvent.key / stored key into a stable comparison form. */
export function normalizeShortcutKey(key: string): string {
  if (key === " ") {
    return "space";
  }
  return key.toLowerCase();
}

export function isModifierOnlyKey(key: string): boolean {
  return MODIFIER_KEYS.has(normalizeShortcutKey(key));
}

export function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const editableElement = target.closest(
    "input, textarea, select, [contenteditable='true']",
  );

  return editableElement !== null;
}

export function shortcutCombosEqual(
  left: ShortcutCombo | null | undefined,
  right: ShortcutCombo | null | undefined,
): boolean {
  if (left == null || right == null) {
    return left == null && right == null;
  }

  return (
    normalizeShortcutKey(left.key) === normalizeShortcutKey(right.key) &&
    Boolean(left.primary) === Boolean(right.primary) &&
    Boolean(left.alt) === Boolean(right.alt) &&
    Boolean(left.shift) === Boolean(right.shift)
  );
}

/**
 * Build a combo from a keydown event. Returns null for modifier-only presses
 * (user is still holding Meta before choosing a key).
 */
export function shortcutComboFromKeyboardEvent(
  event: KeyboardEvent,
): ShortcutCombo | null {
  if (isModifierOnlyKey(event.key)) {
    return null;
  }

  const isMac = isMacPlatform();
  return {
    key: normalizeShortcutKey(event.key),
    primary: isMac ? event.metaKey : event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
  };
}

export function matchesShortcut(
  event: KeyboardEvent,
  combo: ShortcutCombo,
): boolean {
  const isMac = isMacPlatform();
  const expectedPrimary = combo.primary ?? false;
  const hasPrimary = isMac ? event.metaKey : event.ctrlKey;
  const hasOppositePrimary = isMac ? event.ctrlKey : event.metaKey;

  if (expectedPrimary !== hasPrimary || hasOppositePrimary) {
    return false;
  }

  if ((combo.alt ?? false) !== event.altKey) {
    return false;
  }

  if ((combo.shift ?? false) !== event.shiftKey) {
    return false;
  }

  return normalizeShortcutKey(event.key) === normalizeShortcutKey(combo.key);
}

/** Display tokens for a combo (e.g. ["⌘", "⇧", "F"]). */
export function formatShortcut(combo: ShortcutCombo): string[] {
  const keys: string[] = [];

  if (combo.primary) {
    keys.push(isMacPlatform() ? "⌘" : "Ctrl");
  }

  if (combo.alt) {
    keys.push(isMacPlatform() ? "⌥" : "Alt");
  }

  if (combo.shift) {
    keys.push(isMacPlatform() ? "⇧" : "Shift");
  }

  keys.push(formatShortcutKeyLabel(combo.key));
  return keys;
}

export function formatShortcutLabel(combo: ShortcutCombo | null): string {
  if (!combo) {
    return "";
  }
  return formatShortcut(combo).join("");
}

function formatShortcutKeyLabel(key: string): string {
  const normalized = normalizeShortcutKey(key);
  const labels: Record<string, string> = {
    " ": "Space",
    space: "Space",
    enter: "Enter",
    escape: "Esc",
    esc: "Esc",
    backspace: "⌫",
    delete: "Del",
    tab: "Tab",
    arrowup: "↑",
    arrowdown: "↓",
    arrowleft: "←",
    arrowright: "→",
  };

  if (labels[normalized]) {
    return labels[normalized];
  }

  if (normalized.length === 1) {
    return normalized.toUpperCase();
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

/**
 * Stable string form for maps / diagnostics.
 * Key is always `key:<name>` so single-letter keys never collide with
 * modifier flags (e.g. key "p" vs primary flag).
 */
export function serializeShortcutCombo(combo: ShortcutCombo): string {
  const parts: string[] = [];
  if (combo.primary) {
    parts.push("cmd");
  }
  if (combo.alt) {
    parts.push("opt");
  }
  if (combo.shift) {
    parts.push("shift");
  }
  parts.push(`key:${normalizeShortcutKey(combo.key)}`);
  return parts.join("+");
}

export function parseShortcutCombo(value: unknown): ShortcutCombo | null {
  if (value == null) {
    return null;
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    const record = value as Partial<ShortcutCombo>;
    if (typeof record.key !== "string" || record.key.length === 0) {
      return null;
    }
    return {
      key: normalizeShortcutKey(record.key),
      primary: Boolean(record.primary),
      alt: Boolean(record.alt),
      shift: Boolean(record.shift),
    };
  }

  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  // Stored as "cmd+opt+shift+key:f" style tokens.
  const tokens = value.split("+").filter(Boolean);
  if (tokens.length === 0) {
    return null;
  }

  let primary = false;
  let alt = false;
  let shift = false;
  let key: string | null = null;

  for (const token of tokens) {
    if (token === "cmd" || token === "p") {
      primary = true;
      continue;
    }
    if (token === "opt" || token === "a") {
      alt = true;
      continue;
    }
    if (token === "shift" || token === "s") {
      shift = true;
      continue;
    }
    if (token.startsWith("key:")) {
      key = token.slice("key:".length);
      continue;
    }
    // Legacy bare key token (last non-modifier).
    key = token;
  }

  if (!key) {
    return null;
  }

  return {
    key: normalizeShortcutKey(key),
    primary,
    alt,
    shift,
  };
}

export function useGlobalShortcuts(shortcuts: ShortcutDescriptor[]) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        if (!shortcut.combo) {
          continue;
        }

        if (shortcut.enabled && !shortcut.enabled()) {
          continue;
        }

        if (!shortcut.allowInEditable && isEditableTarget(event.target)) {
          continue;
        }

        if (!matchesShortcut(event, shortcut.combo)) {
          continue;
        }

        event.preventDefault();
        shortcut.handler(event);
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [shortcuts]);
}
