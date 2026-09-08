import { describe, expect, it } from "vitest";
import { parseCommitMessageModelSetting } from "./settings";

describe("commit message model settings", () => {
  it.each([
    null,
    "null",
    "{",
    "{}",
    '{"providerId":"p","modelId":"m"}',
  ])("ignores missing or malformed settings %s", (raw) =>
    expect(parseCommitMessageModelSetting(raw)).toBeNull());

  it("preserves runtime options and discards unsupported value types", () => {
    expect(
      parseCommitMessageModelSetting(
        JSON.stringify({
          agentId: "pi",
          providerId: "p",
          modelId: "m",
          reasoningEffort: "high",
          thinkingLevel: "medium",
          serviceTier: "fast",
          fastMode: true,
          openCodeAgent: 123,
          openCodeVariant: "fast",
        }),
      ),
    ).toEqual({
      agentId: "pi",
      providerId: "p",
      modelId: "m",
      reasoningEffort: "high",
      thinkingLevel: "medium",
      serviceTier: "fast",
      fastMode: true,
      openCodeAgent: null,
      openCodeVariant: "fast",
    });
  });
});
