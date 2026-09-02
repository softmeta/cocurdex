import { describe, expect, it } from "vitest";
import { parseOssLicensesFile } from "./oss-licenses-file";

const validFile = {
  entries: [
    {
      homepage: "https://cocurdex.com",
      id: "app:cocurdex",
      kind: "app" as const,
      license: "FSL-1.1-ALv2",
      name: "Cocurdex",
      textId: "abc",
      version: "0.1.3",
    },
  ],
  generatedAt: "2026-09-02T00:00:00.000Z",
  texts: { abc: "FSL" },
  version: 1,
};

describe("parseOssLicensesFile", () => {
  it("accepts a version 1 catalog", () => {
    expect(parseOssLicensesFile(validFile)).toEqual(validFile);
  });

  it("rejects a missing or unknown version", () => {
    expect(() => parseOssLicensesFile({ ...validFile, version: 2 })).toThrow(
      /Unsupported/,
    );
    expect(() =>
      parseOssLicensesFile({ ...validFile, version: undefined }),
    ).toThrow(/Unsupported|Invalid/);
  });

  it("rejects malformed entries", () => {
    expect(() =>
      parseOssLicensesFile({
        ...validFile,
        entries: [{ name: "broken" }],
      }),
    ).toThrow(/Invalid OSS license entry/);
  });
});
