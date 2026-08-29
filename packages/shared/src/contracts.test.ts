import { describe, expect, it } from "vitest";
import { formatContextFileChipLabel, getContextUsageTokens } from "./contracts";

describe("getContextUsageTokens", () => {
  it("returns only an absolute context snapshot", () => {
    expect(
      getContextUsageTokens({
        inputTokens: 120,
        outputTokens: 30,
      }),
    ).toBeNull();
    expect(
      getContextUsageTokens({
        inputTokens: 120,
        outputTokens: 30,
        contextTokensUsed: 90,
      }),
    ).toBe(90);
  });
});

describe("formatContextFileChipLabel", () => {
  it("includes the line range for inlined selections", () => {
    expect(
      formatContextFileChipLabel({
        endLine: 40,
        filePath: "/repo/testdata.json",
        startLine: 1,
      }),
    ).toBe("testdata.json L1-40");
  });

  it("uses the file name only when contents were omitted", () => {
    expect(
      formatContextFileChipLabel({
        contentOmitted: true,
        endLine: 1,
        filePath: "/repo/testdata.json",
        startLine: 1,
      }),
    ).toBe("testdata.json");
  });
});
