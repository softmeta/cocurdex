import { describe, expect, it } from "vitest";
import { parseGrokBuildContextUsage } from "./grok-build-session-info";

describe("parseGrokBuildContextUsage", () => {
  it("reads the context meter out of the ext-method result envelope", () => {
    expect(
      parseGrokBuildContextUsage({
        result: {
          context: { used: 34_000, total: 500_000, usagePct: 7 },
        },
      }),
    ).toEqual({ contextTokensUsed: 34_000, contextWindowSize: 500_000 });
  });

  it("reads an unwrapped payload", () => {
    expect(
      parseGrokBuildContextUsage({ context: { used: 34_000, total: 0 } }),
    ).toEqual({ contextTokensUsed: 34_000 });
  });

  it("keeps the existing meter when the session is no longer resident", () => {
    expect(parseGrokBuildContextUsage({ result: {} })).toBeNull();
  });

  it("treats a zeroed meter as unknown rather than as an empty window", () => {
    expect(
      parseGrokBuildContextUsage({
        result: { context: { used: 0, total: 0 } },
      }),
    ).toBeNull();
  });
});
