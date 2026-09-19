import { describe, expect, it } from "vitest";
import {
  CHAT_DOCK_MIN_WIDTH,
  PINNED_EDITOR_MIN_WIDTH,
  resolveChatDockPinLayout,
} from "./chat-dock-sizing";

describe("chat dock pin layout", () => {
  it("requires space for readable chat and editor panes", () => {
    const threshold = CHAT_DOCK_MIN_WIDTH + PINNED_EDITOR_MIN_WIDTH;
    expect(resolveChatDockPinLayout(threshold - 1, 380).canPin).toBe(false);
    expect(resolveChatDockPinLayout(threshold, 380)).toEqual({
      canPin: true,
      width: CHAT_DOCK_MIN_WIDTH,
    });
    expect(CHAT_DOCK_MIN_WIDTH - 2).toBeGreaterThanOrEqual(375);
  });
  it("clamps an oversized dock before it can squeeze the editor", () => {
    const result = resolveChatDockPinLayout(1000, 850);
    expect(result).toEqual({ canPin: true, width: 500 });
    expect(1000 - result.width).toBeGreaterThanOrEqual(PINNED_EDITOR_MIN_WIDTH);
  });
  it("preserves the preferred width when there is sufficient room", () => {
    expect(resolveChatDockPinLayout(1600, 600)).toEqual({
      canPin: true,
      width: 600,
    });
  });
  it("requires floating at narrow widths and permits docking again after expansion", () => {
    expect(
      [1200, 789, 1200].map(
        (width) => resolveChatDockPinLayout(width, 420).canPin,
      ),
    ).toEqual([true, false, true]);
  });
});
