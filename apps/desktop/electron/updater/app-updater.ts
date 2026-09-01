import log from "electron-log/main.js";
import { autoUpdater } from "electron-updater";
import {
  type AppUpdateEvent,
  type AppUpdateState,
  createInitialAppUpdateState,
  githubReleaseNotesUrl,
  reduceAppUpdateState,
} from "./app-update-state";

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

export type AppUpdateBroadcast = (state: AppUpdateState) => void;

let state: AppUpdateState = createInitialAppUpdateState({
  currentVersion: "0.0.0",
  packaged: false,
});
let broadcast: AppUpdateBroadcast = () => {};
let started = false;

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

export function installAppUpdate(): void {
  if (state.status !== "ready") {
    return;
  }
  autoUpdater.quitAndInstall();
}

export function startAppUpdater(options: {
  broadcast: AppUpdateBroadcast;
  currentVersion: string;
  packaged: boolean;
  whenReadyToCheck?: Promise<unknown>;
}): void {
  if (started) {
    return;
  }
  started = true;
  broadcast = options.broadcast;
  state = createInitialAppUpdateState({
    currentVersion: options.currentVersion,
    packaged: options.packaged,
  });
  broadcast(state);

  if (!options.packaged) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = log;

  autoUpdater.on("checking-for-update", () => {
    apply({ type: "checking" });
  });
  autoUpdater.on("update-available", (info) => {
    apply({
      type: "available",
      version: info.version,
      releaseNotesUrl: githubReleaseNotesUrl(info.version),
    });
  });
  autoUpdater.on("update-not-available", () => {
    apply({ type: "not-available" });
  });
  autoUpdater.on("download-progress", () => {
    apply({ type: "progress" });
  });
  autoUpdater.on("update-downloaded", (info) => {
    apply({
      type: "downloaded",
      version: info.version,
      releaseNotesUrl: githubReleaseNotesUrl(info.version),
    });
  });
  autoUpdater.on("error", (error) => {
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
