import { describe, expect, it } from "vitest";
import { getComposerEnterAction } from "./send-shortcut-types";

describe("getComposerEnterAction", () => {
  it("uses Enter to send by default and preserves the opposite follow-up gesture", () => {
    expect(
      getComposerEnterAction({
        shortcut: "enter",
        hasPrimaryModifier: false,
        hasShiftModifier: false,
        isMultiline: false,
      }),
    ).toEqual({ type: "submit", useOppositeFollowUpBehavior: false });
    expect(
      getComposerEnterAction({
        shortcut: "enter",
        hasPrimaryModifier: true,
        hasShiftModifier: false,
        isMultiline: false,
      }),
    ).toEqual({ type: "submit", useOppositeFollowUpBehavior: true });
    expect(
      getComposerEnterAction({
        shortcut: "enter",
        hasPrimaryModifier: false,
        hasShiftModifier: true,
        isMultiline: false,
      }),
    ).toEqual({ type: "newline" });
  });

  it("switches multiline prompts to primary-modifier submission", () => {
    expect(
      getComposerEnterAction({
        shortcut: "command-enter-multiline",
        hasPrimaryModifier: false,
        hasShiftModifier: false,
        isMultiline: false,
      }),
    ).toEqual({ type: "submit", useOppositeFollowUpBehavior: false });
    expect(
      getComposerEnterAction({
        shortcut: "command-enter-multiline",
        hasPrimaryModifier: false,
        hasShiftModifier: false,
        isMultiline: true,
      }),
    ).toEqual({ type: "newline" });
    expect(
      getComposerEnterAction({
        shortcut: "command-enter-multiline",
        hasPrimaryModifier: true,
        hasShiftModifier: false,
        isMultiline: true,
      }),
    ).toEqual({ type: "submit", useOppositeFollowUpBehavior: false });
  });

  it("requires the primary modifier when configured to do so", () => {
    expect(
      getComposerEnterAction({
        shortcut: "command-enter",
        hasPrimaryModifier: false,
        hasShiftModifier: false,
        isMultiline: false,
      }),
    ).toEqual({ type: "newline" });
    expect(
      getComposerEnterAction({
        shortcut: "command-enter",
        hasPrimaryModifier: true,
        hasShiftModifier: false,
        isMultiline: false,
      }),
    ).toEqual({ type: "submit", useOppositeFollowUpBehavior: false });
  });

  it("uses primary plus Shift for the opposite follow-up in command modes", () => {
    for (const shortcut of [
      "command-enter-multiline",
      "command-enter",
    ] as const) {
      expect(
        getComposerEnterAction({
          shortcut,
          hasPrimaryModifier: true,
          hasShiftModifier: true,
          isMultiline: true,
        }),
      ).toEqual({ type: "submit", useOppositeFollowUpBehavior: true });
    }
  });
});
