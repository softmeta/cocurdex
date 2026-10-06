import { cp, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, ipcMain } from "electron";
import { createLogger } from "../logging";
import { buildAppImageCliLauncher } from "./appimage-launcher";
import {
  type CliPathStatus,
  installCliOnPath as installCliOnPathImpl,
  pathExists,
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

interface AppImageCliInstall {
  appImagePath: string;
  runtimeRoot: string;
  runtimeDir: string;
  cliScriptPath: string;
}

function resolveAppImageCliInstall(): AppImageCliInstall | null {
  const appImagePath = process.env.APPIMAGE;
  if (process.platform !== "linux" || !app.isPackaged || !appImagePath) {
    return null;
  }
  const runtimeRoot = path.join(app.getPath("userData"), "cli-runtime");
  const runtimeDir = path.join(runtimeRoot, app.getVersion());
  return {
    appImagePath,
    runtimeRoot,
    runtimeDir,
    cliScriptPath: path.join(runtimeDir, "cli.mjs"),
  };
}

async function prepareAppImageCliRuntime(install: AppImageCliInstall) {
  if (!(await pathExists(install.cliScriptPath))) {
    const staging = `${install.runtimeDir}.staging-${process.pid}`;
    await rm(staging, { recursive: true, force: true });
    await cp(path.dirname(getBundledCliLauncherPath()), staging, {
      recursive: true,
    });
    await rm(install.runtimeDir, { recursive: true, force: true });
    await rename(staging, install.runtimeDir);
  }
  const currentVersion = path.basename(install.runtimeDir);
  for (const entry of await readdir(install.runtimeRoot)) {
    if (entry !== currentVersion) {
      await rm(path.join(install.runtimeRoot, entry), {
        recursive: true,
        force: true,
      });
    }
  }
}

function resolveInstallSource(): {
  sourcePath: string;
  scriptLauncher?: string;
} {
  const appImage = resolveAppImageCliInstall();
  if (!appImage) {
    return { sourcePath: getBundledCliLauncherPath() };
  }
  return {
    sourcePath: appImage.cliScriptPath,
    scriptLauncher: buildAppImageCliLauncher(appImage),
  };
}

export async function getCliPathStatus(): Promise<CliPathStatus> {
  return readCliPathStatus({
    platform: process.platform,
    ...resolveInstallSource(),
    pathEnv: process.env.PATH,
  });
}

export async function installCliOnPath(): Promise<CliPathStatus> {
  const appImage = resolveAppImageCliInstall();
  if (appImage) {
    await prepareAppImageCliRuntime(appImage);
  }
  const status = await installCliOnPathImpl({
    platform: process.platform,
    ...resolveInstallSource(),
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
  const status = await uninstallCliFromPathImpl({
    platform: process.platform,
    ...resolveInstallSource(),
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
    const appImage = resolveAppImageCliInstall();
    if (appImage) {
      await prepareAppImageCliRuntime(appImage);
    }
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
