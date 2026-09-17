export const APP_UPDATE_CHANNELS = ["stable", "test"] as const;

export type AppUpdateChannel = (typeof APP_UPDATE_CHANNELS)[number];

export const DEFAULT_APP_UPDATE_CHANNEL: AppUpdateChannel = "stable";

export const APP_UPDATE_CHANNEL_FILE = "app-update-channel.json";

export const TEST_UPDATE_FEED_CHANNEL = "beta";

export const STABLE_UPDATE_FEED_CHANNEL = "latest";

export function isAppUpdateChannel(value: unknown): value is AppUpdateChannel {
  return value === "stable" || value === "test";
}

export function parseStoredAppUpdateChannel(raw: string): AppUpdateChannel {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isAppUpdateChannel(parsed)) {
      return parsed;
    }
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "channel" in parsed &&
      isAppUpdateChannel(parsed.channel)
    ) {
      return parsed.channel;
    }
  } catch {
    return DEFAULT_APP_UPDATE_CHANNEL;
  }
  return DEFAULT_APP_UPDATE_CHANNEL;
}

export function isPrereleaseVersion(version: string): boolean {
  return /-\w/.test(version);
}

export type AppUpdateFeedChannel =
  | typeof STABLE_UPDATE_FEED_CHANNEL
  | typeof TEST_UPDATE_FEED_CHANNEL;

export function updaterConfigForChannel(
  channel: AppUpdateChannel,
  currentVersion: string,
): {
  allowDowngrade: boolean;
  allowPrerelease: boolean;
  feedChannel: AppUpdateFeedChannel;
} {
  if (channel === "test") {
    return {
      allowDowngrade: true,
      allowPrerelease: true,
      feedChannel: TEST_UPDATE_FEED_CHANNEL,
    };
  }
  return {
    allowDowngrade: isPrereleaseVersion(currentVersion),
    allowPrerelease: false,
    feedChannel: STABLE_UPDATE_FEED_CHANNEL,
  };
}
