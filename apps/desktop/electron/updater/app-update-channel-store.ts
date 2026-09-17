import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  APP_UPDATE_CHANNEL_FILE,
  type AppUpdateChannel,
  DEFAULT_APP_UPDATE_CHANNEL,
  parseStoredAppUpdateChannel,
} from "./app-update-channel";

export function appUpdateChannelFilePath(userDataPath: string): string {
  return path.join(userDataPath, APP_UPDATE_CHANNEL_FILE);
}

export function loadAppUpdateChannel(userDataPath: string): AppUpdateChannel {
  try {
    return parseStoredAppUpdateChannel(
      readFileSync(appUpdateChannelFilePath(userDataPath), "utf8"),
    );
  } catch {
    return DEFAULT_APP_UPDATE_CHANNEL;
  }
}

export function saveAppUpdateChannel(
  userDataPath: string,
  channel: AppUpdateChannel,
): void {
  writeFileSync(
    appUpdateChannelFilePath(userDataPath),
    `${JSON.stringify({ channel })}\n`,
    "utf8",
  );
}
