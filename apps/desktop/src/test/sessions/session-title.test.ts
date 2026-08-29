import { describe, expect, it } from "vitest";
import { generateLocalSessionTitle } from "@/features/sessions/session-title";

describe("generateLocalSessionTitle", () => {
  it("falls back for empty messages", () => {
    expect(generateLocalSessionTitle("   \n ", "New Codex session")).toBe(
      "New Codex session",
    );
  });

  it("cleans punctuation and whitespace", () => {
    expect(
      generateLocalSessionTitle(
        '  "Fix the session title flow!"  ',
        "Fallback",
      ),
    ).toBe("Fix the session title flow");
  });

  it("caps long English titles by words and length", () => {
    expect(
      generateLocalSessionTitle(
        "Implement automatic session naming with provider refinement and fallback behavior",
        "Fallback",
      ),
    ).toBe("Implement automatic session naming with provider");
  });

  it("preserves Chinese titles", () => {
    expect(
      generateLocalSessionTitle("自动生成 session name 这个场景", "Fallback"),
    ).toBe("自动生成 session name 这个场景");
  });

  it("keeps long Chinese fallback titles short", () => {
    expect(
      generateLocalSessionTitle(
        "洗车店离我家50m, 我想去洗车，我是开车过去还是走过去",
        "Fallback",
      ),
    ).toBe("洗车店离我家50m");
  });

  it("drops context attachment noise", () => {
    expect(
      generateLocalSessionTitle(
        "Summarize this file\n<context file omitted>\n```ts",
        "Fallback",
      ),
    ).toBe("Summarize this file");
  });
});
