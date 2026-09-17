import { ipcMain } from "electron";
import { z } from "zod";
import { registerHandler } from "../ipc";
import { APP_UPDATE_CHANNELS } from "./app-update-channel";
import {
  checkForAppUpdate,
  dismissAppUpdate,
  getAppUpdateState,
  installAppUpdate,
  setAppUpdateChannel,
} from "./app-updater";

export type { AppUpdateChannel } from "./app-update-channel";
export type { AppUpdateState, AppUpdateStatus } from "./app-update-state";
export { startAppUpdater } from "./app-updater";

export function registerAppUpdateHandlers(): void {
  ipcMain.handle("app:update:getState", () => getAppUpdateState());
  ipcMain.handle("app:update:check", () => checkForAppUpdate());
  ipcMain.handle("app:update:dismiss", () => dismissAppUpdate());
  ipcMain.handle("app:update:install", () => {
    installAppUpdate();
  });
  registerHandler(
    ipcMain,
    "app:update:setChannel",
    z.enum(APP_UPDATE_CHANNELS),
    (_event, channel) => setAppUpdateChannel(channel),
  );
}
