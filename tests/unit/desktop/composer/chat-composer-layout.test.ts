import { describe, expect, it } from "vitest";
import {
  getNextPillExpandedState,
  getPillComposerShapeClassName,
} from "@/features/composer/chat-composer-layout";

describe("chat composer layout", () => {
  it("keeps the pill composer expanded when collapsed width would wrap", () => {
    expect(
      getNextPillExpandedState({
        collapsedHeight: 48,
        current: true,
        renderedHeight: 24,
        singleLineHeight: 24,
      }),
    ).toBe(true);
  });

  it("collapses the pill composer when collapsed width fits one line", () => {
    expect(
      getNextPillExpandedState({
        collapsedHeight: 24,
        current: true,
        renderedHeight: 24,
        singleLineHeight: 24,
      }),
    ).toBe(false);
  });

  it("expands the pill composer from collapsed layout when rendered text wraps", () => {
    expect(
      getNextPillExpandedState({
        collapsedHeight: 48,
        current: false,
        renderedHeight: 48,
        singleLineHeight: 24,
      }),
    ).toBe(true);
  });

  it("uses the default composer radius after the pill composer expands", () => {
    expect(getPillComposerShapeClassName(true)).toBe("rounded-card");
    expect(getPillComposerShapeClassName(false)).toBe("rounded-full");
  });
});
