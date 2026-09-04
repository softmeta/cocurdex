import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export interface EditorSettings {
  codeMinimap: boolean;
}

export const EDITOR_SETTINGS_STORAGE_KEY = "agents.desktop.editor-settings";

export const defaultEditorSettings: EditorSettings = {
  codeMinimap: false,
};

export function normalizeEditorSettings(
  value: Partial<EditorSettings> | null | undefined,
): EditorSettings {
  return {
    codeMinimap: value?.codeMinimap === true,
  };
}

const storedEditorSettingsAtom = atomWithStorage<Partial<EditorSettings>>(
  EDITOR_SETTINGS_STORAGE_KEY,
  defaultEditorSettings,
);

export const editorSettingsAtom = atom(
  (get) => normalizeEditorSettings(get(storedEditorSettingsAtom)),
  (_get, set, next: EditorSettings) => {
    set(storedEditorSettingsAtom, normalizeEditorSettings(next));
  },
);
