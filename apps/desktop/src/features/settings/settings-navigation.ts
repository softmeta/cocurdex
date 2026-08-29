import type { SettingsSectionId } from "@/app/layout/app-shell/app-shell-types";

/**
 * Cross-feature entry into Settings. AppShell registers the handler on mount;
 * menus and empty states call `openSettings("providers")` without prop drilling.
 */
type OpenSettingsHandler = (section: SettingsSectionId) => void;

let openSettingsHandler: OpenSettingsHandler | null = null;

export function registerOpenSettingsHandler(handler: OpenSettingsHandler) {
  openSettingsHandler = handler;
  return () => {
    if (openSettingsHandler === handler) {
      openSettingsHandler = null;
    }
  };
}

export function openSettings(section: SettingsSectionId = "appearance") {
  openSettingsHandler?.(section);
}
