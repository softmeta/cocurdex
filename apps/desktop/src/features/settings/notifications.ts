export interface NotificationSettings {
  systemNotifications: boolean;
  completionSound: boolean;
}

export const NOTIFICATION_SETTINGS_STORAGE_KEY =
  "agents.desktop.notification-settings";

// System notifications default on, completion sound off — mirrors Cursor.
export const defaultNotificationSettings: NotificationSettings = {
  systemNotifications: true,
  completionSound: false,
};

function normalizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export function getStoredNotificationSettings(): NotificationSettings {
  if (typeof window === "undefined") {
    return defaultNotificationSettings;
  }

  const storedSettings = window.localStorage.getItem(
    NOTIFICATION_SETTINGS_STORAGE_KEY,
  );

  if (!storedSettings) {
    return defaultNotificationSettings;
  }

  try {
    const parsed = JSON.parse(storedSettings) as Partial<NotificationSettings>;

    return {
      systemNotifications: normalizeBoolean(
        parsed.systemNotifications,
        defaultNotificationSettings.systemNotifications,
      ),
      completionSound: normalizeBoolean(
        parsed.completionSound,
        defaultNotificationSettings.completionSound,
      ),
    };
  } catch {
    return defaultNotificationSettings;
  }
}
