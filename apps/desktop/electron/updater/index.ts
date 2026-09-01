import { ipcMain } from "electron";
import {
  checkForAppUpdate,
  dismissAppUpdate,
  getAppUpdateState,
  installAppUpdate,
} from "./app-updater";

export type { AppUpdateState, AppUpdateStatus } from "./app-update-state";
export { startAppUpdater } from "./app-updater";

export function registerAppUpdateHandlers(): void {
  ipcMain.handle("app:update:getState", () => getAppUpdateState());
  ipcMain.handle("app:update:check", () => checkForAppUpdate());
  ipcMain.handle("app:update:dismiss", () => dismissAppUpdate());
  ipcMain.handle("app:update:install", () => {
    installAppUpdate();
  });
}
