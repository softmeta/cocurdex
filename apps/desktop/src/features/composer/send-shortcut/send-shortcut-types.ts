export const sendShortcuts = [
  "enter",
  "command-enter-multiline",
  "command-enter",
] as const;

export type SendShortcut = (typeof sendShortcuts)[number];

export function isSendShortcut(value: unknown): value is SendShortcut {
  return sendShortcuts.includes(value as SendShortcut);
}

export type ComposerEnterAction =
  | { type: "newline" }
  | { type: "submit"; useOppositeFollowUpBehavior: boolean };

export function getComposerEnterAction(options: {
  shortcut: SendShortcut;
  hasPrimaryModifier: boolean;
  hasShiftModifier: boolean;
  isMultiline: boolean;
}): ComposerEnterAction {
  if (options.hasPrimaryModifier && options.hasShiftModifier) {
    return { type: "submit", useOppositeFollowUpBehavior: true };
  }

  if (options.shortcut === "enter") {
    if (options.hasShiftModifier) return { type: "newline" };
    return {
      type: "submit",
      useOppositeFollowUpBehavior: options.hasPrimaryModifier,
    };
  }

  if (options.shortcut === "command-enter-multiline") {
    if (!options.isMultiline) {
      if (options.hasShiftModifier) return { type: "newline" };
      return {
        type: "submit",
        useOppositeFollowUpBehavior: options.hasPrimaryModifier,
      };
    }
    if (options.hasPrimaryModifier) {
      return { type: "submit", useOppositeFollowUpBehavior: false };
    }
    return { type: "newline" };
  }

  if (options.hasPrimaryModifier) {
    return { type: "submit", useOppositeFollowUpBehavior: false };
  }
  return { type: "newline" };
}
