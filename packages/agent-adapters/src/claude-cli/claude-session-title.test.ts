import { describe, expect, it } from "vitest";
import { readClaudeNativeSessionTitle } from "./claude-session-title";

describe("readClaudeNativeSessionTitle", () => {
  it("uses the custom or AI title when Claude persisted one", () => {
    expect(
      readClaudeNativeSessionTitle({
        customTitle: "  CR 数据统计页优化建议  ",
        firstPrompt:
          "我这个应用的数据统计，你看一下现在是否有问题。给出你的专业建议。",
        summary:
          "我这个应用的数据统计，你看一下现在是否有问题。给出你的专业建议。",
      }),
    ).toBe("CR 数据统计页优化建议");
  });

  it("ignores summary when it is only the first user prompt", () => {
    const prompt =
      "我这个应用的数据统计，你看一下现在是否有问题。我要向老板汇报我这个 CR 应用的价值。你觉得我的数据统计页是否应该继续优化？给出你的专业建议。";

    expect(
      readClaudeNativeSessionTitle({
        firstPrompt: prompt,
        summary: prompt,
      }),
    ).toBeNull();
  });

  it("ignores summary when it is a later user prompt fallback", () => {
    expect(
      readClaudeNativeSessionTitle({
        firstPrompt: "Inspect the CR statistics page",
        summary: "再看一下空态",
      }),
    ).toBeNull();
  });

  it("returns null when session info is missing", () => {
    expect(readClaudeNativeSessionTitle(undefined)).toBeNull();
  });
});
