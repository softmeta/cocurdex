import {
  formatContextFileChipLabel,
  getContextUsageTokens,
  mergeUsageRecords,
} from "@cocurdex/shared/internal/contracts";
import { describe, expect, it } from "vitest";

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

describe("mergeUsageRecords", () => {
  it("clears an unavailable context count while keeping the window and totals", () => {
    const usage = {
      inputTokens: 120,
      outputTokens: 30,
      contextTokensUsed: 90,
      contextWindowSize: 100,
    };
    const cleared = mergeUsageRecords(usage, {
      inputTokens: 0,
      outputTokens: 0,
      contextTokensUsed: null,
    });
    expect(cleared).toMatchObject({ ...usage, contextTokensUsed: null });
    expect(getContextUsageTokens(cleared)).toBeNull();
    expect(
      getContextUsageTokens(
        mergeUsageRecords(cleared, {
          inputTokens: 0,
          outputTokens: 0,
          contextTokensUsed: 82,
        }),
      ),
    ).toBe(82);
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
