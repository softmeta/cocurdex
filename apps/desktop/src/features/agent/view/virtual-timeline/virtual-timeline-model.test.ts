import { describe, expect, it } from "vitest";
import {
  getAdjacentPromptIndexes,
  getConversationWindow,
  getMessageScrollTop,
} from "./virtual-timeline-model";

describe("virtual conversation window", () => {
  it("bounds history rendering while retaining the live tail and jump target", () => {
    expect(
      getConversationWindow(
        { startIndex: 40, endIndex: 42, overscan: 2, count: 1000 },
        [999, 700, -1, 1000],
        null,
      ),
    ).toEqual([38, 39, 40, 41, 42, 43, 44, 700, 999]);
  });

  it("retains a selected range in either selection direction", () => {
    const range = { startIndex: 10, endIndex: 11, overscan: 0, count: 100 };
    const expected = [5, 6, 7, 8, 10, 11];
    expect(getConversationWindow(range, [], [5, 8])).toEqual(expected);
    expect(getConversationWindow(range, [], [8, 5])).toEqual(expected);
  });

  it("finds prompt anchors around groups without a prompt", () => {
    expect(getAdjacentPromptIndexes([1, 4, 9, 15], 7)).toEqual([1, 4, 9]);
    expect(getAdjacentPromptIndexes([1, 4, 9, 15], 0)).toEqual([1]);
    expect(getAdjacentPromptIndexes([], 7)).toEqual([]);
  });
});

describe("measured message alignment", () => {
  it("aligns the real prompt after an estimated jump", () => {
    expect(getMessageScrollTop(5000, 130, 20_000, 600)).toBe(5110);
    expect(getMessageScrollTop(5000, -70, 20_000, 600)).toBe(4910);
  });

  it("clamps navigation at both content edges", () => {
    expect(getMessageScrollTop(0, 0, 20_000, 600)).toBe(0);
    expect(getMessageScrollTop(19_000, 900, 20_000, 600)).toBe(19_400);
    expect(getMessageScrollTop(0, 100, 200, 600)).toBe(0);
  });
});
