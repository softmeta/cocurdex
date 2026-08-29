export const activityDisplayModes = [
  "expanded",
  "condensed",
  "hidden",
] as const;
export type ActivityDisplayMode = (typeof activityDisplayModes)[number];

export interface ChatDisplaySettings {
  // How the pre-answer process (reasoning + tool calls) renders, from most to
  // least detail:
  // - expanded: every cluster open inline
  // - condensed: the whole turn's process folds into one activity block (default)
  // - hidden: process removed, only answers remain
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
