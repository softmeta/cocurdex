export const activityDisplayModes = [
  "hidden",
  "condensed",
  "expanded",
] as const;
export type ActivityDisplayMode = (typeof activityDisplayModes)[number];

export interface ChatDisplaySettings {
  activityDisplay: ActivityDisplayMode;
}

export const defaultChatDisplaySettings: ChatDisplaySettings = {
  activityDisplay: "condensed",
};

function normalizeActivityDisplay(value: unknown): ActivityDisplayMode {
  return activityDisplayModes.includes(value as ActivityDisplayMode)
    ? (value as ActivityDisplayMode)
    : defaultChatDisplaySettings.activityDisplay;
}

export function normalizeChatDisplaySettings(
  value: Partial<ChatDisplaySettings> | null | undefined,
): ChatDisplaySettings {
  return {
    activityDisplay: normalizeActivityDisplay(value?.activityDisplay),
  };
}
