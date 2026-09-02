import { ipcMain } from "electron";
import {
  openChromiumLicenses,
  readOssLicensesPayload,
} from "./oss-licenses-service";

export {
  resolveChromiumLicensesCandidates,
  resolveOssLicensesFilePath,
} from "./oss-licenses-paths";

export function registerOssLicensesHandlers(): void {
  ipcMain.handle("app:getOssLicenses", () => readOssLicensesPayload());
  ipcMain.handle("app:openChromiumLicenses", () => openChromiumLicenses());
}
