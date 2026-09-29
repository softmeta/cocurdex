export const activityDisplayModes = [
  "hidden",
  "condensed",
  "expanded",
] as const;
export type ActivityDisplayMode = (typeof activityDisplayModes)[number];

export interface ChatDisplaySettings {
  // How the process (reasoning, tool calls, interim replies) renders, from
  // least to most detail:
  // - hidden: process removed, only final replies remain
  // - condensed: the whole turn's process folds into one activity block (default)
  // - expanded: every cluster open inline
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

// Merge stored values onto defaults so older payloads missing newly added keys
// (or carrying invalid enum values) resolve to safe fallbacks.
export function normalizeChatDisplaySettings(
  value: Partial<ChatDisplaySettings> | null | undefined,
): ChatDisplaySettings {
  return {
    activityDisplay: normalizeActivityDisplay(value?.activityDisplay),
  };
}
