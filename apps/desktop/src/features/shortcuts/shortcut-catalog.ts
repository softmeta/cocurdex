import type { ShortcutCombo } from "@/lib";

/**
 * Built-in keyboard shortcut catalog.
 *
 * Defaults are VS Code / Cursor-adjacent where it helps muscle memory.
 * User overrides live in localStorage (see shortcut-store); null override
 * means the action is unbound.
 */

export const shortcutCategories = [
  "general",
  "layout",
  "chat",
  "editor",
  "browser",
] as const;

export type ShortcutCategory = (typeof shortcutCategories)[number];

export const shortcutIds = [
  "fileSearch",
  "toggleLeftSidebar",
  "toggleRightPanel",
  "toggleEditorFullscreen",
  "toggleChatDock",
  "toggleWorkspaceSearch",
  "toggleDesignMode",
] as const;

export type ShortcutId = (typeof shortcutIds)[number];

export interface ShortcutDefinition {
  id: ShortcutId;
  category: ShortcutCategory;
  defaultCombo: ShortcutCombo;
  /**
   * When true, the shortcut still fires while focus is in an input,
   * contenteditable, or Monaco-like field.
   */
  allowInEditable: boolean;
}

export const SHORTCUT_CATALOG: readonly ShortcutDefinition[] = [
  {
    id: "fileSearch",
    category: "general",
    defaultCombo: { key: "p", primary: true },
    allowInEditable: false,
  },
  {
    id: "toggleLeftSidebar",
    category: "layout",
    defaultCombo: { key: "b", primary: true },
    allowInEditable: true,
  },
  {
    id: "toggleRightPanel",
    category: "layout",
    defaultCombo: { key: "\\", primary: true },
    allowInEditable: true,
  },
  {
    id: "toggleEditorFullscreen",
    category: "layout",
    defaultCombo: { key: "e", primary: true, shift: true },
    allowInEditable: true,
  },
  {
    id: "toggleChatDock",
    category: "chat",
    defaultCombo: { key: "j", primary: true },
    allowInEditable: true,
  },
  {
    id: "toggleWorkspaceSearch",
    category: "editor",
    defaultCombo: { key: "f", primary: true, shift: true },
    allowInEditable: false,
  },
  {
    id: "toggleDesignMode",
    category: "browser",
    defaultCombo: { key: "d", primary: true, shift: true },
    allowInEditable: false,
  },
] as const;

const catalogById = new Map(
  SHORTCUT_CATALOG.map((definition) => [definition.id, definition]),
);

export function getShortcutDefinition(
  id: ShortcutId,
): ShortcutDefinition | undefined {
  return catalogById.get(id);
}

export function isShortcutId(value: string): value is ShortcutId {
  return catalogById.has(value as ShortcutId);
}

export function shortcutsInCategory(
  category: ShortcutCategory,
): ShortcutDefinition[] {
  return SHORTCUT_CATALOG.filter(
    (definition) => definition.category === category,
  );
}
