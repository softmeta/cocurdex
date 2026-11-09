import type { SettingsSectionId } from "@/app/layout/app-shell/app-shell-types";

type OpenSettingsHandler = (section?: SettingsSectionId) => void;

let openSettingsHandler: OpenSettingsHandler | null = null;

export function registerOpenSettingsHandler(handler: OpenSettingsHandler) {
  openSettingsHandler = handler;
  return () => {
    if (openSettingsHandler === handler) {
      openSettingsHandler = null;
    }
  };
}

export function openSettings(section?: SettingsSectionId) {
  openSettingsHandler?.(section);
}

type CloseSettingsHandler = () => void;

let closeSettingsHandler: CloseSettingsHandler | null = null;

export function registerCloseSettingsHandler(handler: CloseSettingsHandler) {
  closeSettingsHandler = handler;
  return () => {
    if (closeSettingsHandler === handler) {
      closeSettingsHandler = null;
    }
  };
}

export function closeSettings() {
  closeSettingsHandler?.();
}
