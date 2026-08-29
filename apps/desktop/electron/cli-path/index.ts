import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, ipcMain } from "electron";
import { createLogger } from "../logging";
import {
  type CliPathStatus,
  installCliOnPath as installCliOnPathImpl,
  readCliPathStatus,
  resolveBundledCliLauncherPath,
  uninstallCliFromPath as uninstallCliFromPathImpl,
} from "./cli-path";

export type { CliPathStatus } from "./cli-path";
export {
  getCliInstallBinDir,
  getCliInstallPath,
  getCliLauncherFileName,
  isBinDirOnPath,
  resolveBundledCliLauncherPath,
} from "./cli-path";

const logger = createLogger("cli-path");

function desktopRootFromMainModule(): string {
  // electron/cli-path -> apps/desktop
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

export function getBundledCliLauncherPath(): string {
  return resolveBundledCliLauncherPath({
    platform: process.platform,
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    desktopRoot: desktopRootFromMainModule(),
  });
}

export function getBundledDaemonEntryPath(): string {
  return path.join(path.dirname(getBundledCliLauncherPath()), "daemon.cjs");
}

export async function getCliPathStatus(): Promise<CliPathStatus> {
  const sourcePath = getBundledCliLauncherPath();
  return readCliPathStatus({
    platform: process.platform,
    sourcePath,
    pathEnv: process.env.PATH,
  });
}

export async function installCliOnPath(): Promise<CliPathStatus> {
  const sourcePath = getBundledCliLauncherPath();
  const status = await installCliOnPathImpl({
    platform: process.platform,
    sourcePath,
  });
  logger.info("cli.install", {
    installPath: status.installPath,
    pointsToCurrentApp: status.pointsToCurrentApp,
    binDirOnPath: status.binDirOnPath,
    error: status.error,
  });
  return status;
}

export async function uninstallCliFromPath(): Promise<CliPathStatus> {
  const sourcePath = getBundledCliLauncherPath();
  const status = await uninstallCliFromPathImpl({
    platform: process.platform,
    sourcePath,
  });
  logger.info("cli.uninstall", {
    installPath: status.installPath,
    installed: status.installed,
  });
  return status;
}

/** Silent best-effort install for packaged first launch. */
export async function ensureCliOnPathBestEffort(): Promise<void> {
  if (!app.isPackaged) {
    return;
  }

  try {
    const before = await getCliPathStatus();
    if (!before.available) {
      logger.warn("cli.ensure.skipped", { reason: "launcher-missing" });
      return;
    }
    if (before.installed && before.pointsToCurrentApp) {
      return;
    }
    await installCliOnPath();
  } catch (error) {
    logger.warn("cli.ensure.failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export function registerCliPathHandlers(): void {
  ipcMain.handle("cli:getPathStatus", async () => getCliPathStatus());
  ipcMain.handle("cli:installOnPath", async () => installCliOnPath());
  ipcMain.handle("cli:uninstallFromPath", async () => uninstallCliFromPath());
}
