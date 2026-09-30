import { app } from "electron";
import type { AppUpdater } from "electron-updater";
import { createUpstreamLogger } from "../logging";
import {
  type AppUpdateChannel,
  isPrereleaseVersion,
  updaterConfigForChannel,
} from "./app-update-channel";
import {
  loadAppUpdateChannel,
  saveAppUpdateChannel,
} from "./app-update-channel-store";
import {
  type AppUpdateEvent,
  type AppUpdateState,
  createInitialAppUpdateState,
  githubReleaseNotesUrl,
  reduceAppUpdateState,
} from "./app-update-state";
import { assertUpdateArchitecture } from "./update-architecture";

let autoUpdater: AppUpdater | null = null;

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

export type AppUpdateBroadcast = (state: AppUpdateState) => void;

let state: AppUpdateState = createInitialAppUpdateState({
  currentVersion: "0.0.0",
  packaged: false,
});
let broadcast: AppUpdateBroadcast = () => {};
let started = false;
let packaged = false;
let currentVersion = "0.0.0";
let userDataPath = "";

function apply(event: AppUpdateEvent) {
  const next = reduceAppUpdateState(state, event);
  if (next === state) {
    return;
  }
  state = next;
  broadcast(state);
}

async function runCheck() {
  if (state.status === "unsupported") {
    return state;
  }
  if (!autoUpdater) {
    return state;
  }
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    apply({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
  return state;
}

export function getAppUpdateState(): AppUpdateState {
  return state;
}

export async function checkForAppUpdate(): Promise<AppUpdateState> {
  return runCheck();
}

export function dismissAppUpdate(): AppUpdateState {
  apply({ type: "dismiss" });
  return state;
}

export async function setAppUpdateChannel(
  channel: AppUpdateChannel,
): Promise<AppUpdateState> {
  if (channel === state.channel) {
    return state;
  }
  if (userDataPath) {
    saveAppUpdateChannel(userDataPath, channel);
  }
  applyUpdaterConfig(channel, currentVersion);
  apply({ type: "set-channel", channel });
  if (packaged) {
    return runCheck();
  }
  return state;
}

export function installAppUpdate(): void {
  if (state.status !== "ready") {
    return;
  }
  autoUpdater?.quitAndInstall();
}

function applyUpdaterConfig(channel: AppUpdateChannel, version: string): void {
  if (!autoUpdater) {
    return;
  }
  const config = updaterConfigForChannel(channel, version);
  autoUpdater.channel = config.feedChannel;
  autoUpdater.allowPrerelease = config.allowPrerelease;
  autoUpdater.allowDowngrade = config.allowDowngrade;
}

export async function startAppUpdater(options: {
  broadcast: AppUpdateBroadcast;
  currentVersion: string;
  packaged: boolean;
  userDataPath: string;
  whenReadyToCheck?: Promise<unknown>;
}): Promise<void> {
  if (started) {
    return;
  }
  started = true;
  broadcast = options.broadcast;
  packaged = options.packaged;
  currentVersion = options.currentVersion;
  userDataPath = options.userDataPath;
  const channel = loadAppUpdateChannel(options.userDataPath);
  state = createInitialAppUpdateState({
    channel,
    currentVersion: options.currentVersion,
    packaged: options.packaged,
  });
  broadcast(state);

  if (!options.packaged) {
    return;
  }

  const updater = (await import("electron-updater")).default.autoUpdater;
  autoUpdater = updater;
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.logger = createUpstreamLogger("updater");
  applyUpdaterConfig(state.channel, options.currentVersion);
  const isUpdateSupported = updater.isUpdateSupported;
  updater.isUpdateSupported = (info) => {
    assertUpdateArchitecture(info, {
      platform: process.platform,
      arch: process.arch,
      translated: app.runningUnderARM64Translation,
    });
    if (state.channel === "stable" && isPrereleaseVersion(info.version)) {
      return false;
    }
    return isUpdateSupported(info);
  };

  updater.on("checking-for-update", () => {
    apply({ type: "checking" });
  });
  updater.on("update-available", (info) => {
    apply({
      type: "available",
      version: info.version,
      releaseNotesUrl: githubReleaseNotesUrl(info.version),
    });
  });
  updater.on("update-not-available", () => {
    apply({ type: "not-available" });
  });
  updater.on("download-progress", (info) => {
    apply({ percent: info.percent, type: "progress" });
  });
  updater.on("update-downloaded", (info) => {
    apply({
      type: "downloaded",
      version: info.version,
      releaseNotesUrl: githubReleaseNotesUrl(info.version),
    });
  });
  updater.on("error", (error) => {
    apply({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  });

  const beginChecking = () => {
    void runCheck();
    setInterval(() => {
      void runCheck();
    }, CHECK_INTERVAL_MS);
  };

  if (options.whenReadyToCheck) {
    void options.whenReadyToCheck.then(beginChecking);
  } else {
    beginChecking();
  }
}
