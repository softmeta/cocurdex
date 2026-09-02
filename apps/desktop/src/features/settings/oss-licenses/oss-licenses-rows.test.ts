import { describe, expect, it } from "vitest";
import type { OssLicensesPayload } from "@/lib/types";
import {
  buildOssLicenseRows,
  chromiumLicenseRow,
  filterOssLicenseRows,
} from "./oss-licenses-rows";

function payload(
  overrides: Partial<OssLicensesPayload> = {},
): OssLicensesPayload {
  return {
    chromiumAvailable: false,
    entries: [
      {
        homepage: "https://cocurdex.com",
        id: "app:cocurdex",
        kind: "app",
        license: "FSL-1.1-ALv2",
        name: "Cocurdex",
        textId: "app",
        version: "0.1.3",
      },
      {
        homepage: null,
        id: "native:fd",
        kind: "native",
        license: "MIT",
        name: "fd",
        textId: "mit",
        version: "10.3.0",
      },
      {
        homepage: null,
        id: "react@19.1.0",
        kind: "package",
        license: "MIT",
        name: "react",
        textId: "mit",
        version: "19.1.0",
      },
    ],
    texts: { app: "FSL", mit: "MIT" },
    ...overrides,
  };
}

describe("buildOssLicenseRows", () => {
  it("inserts Chromium after the app license when the file is available", () => {
    const rows = buildOssLicenseRows(payload({ chromiumAvailable: true }));
    expect(rows.map((row) => row.id)).toEqual([
      "app:cocurdex",
      "chromium",
      "native:fd",
      "react@19.1.0",
    ]);
  });

  it("omits Chromium when the credits file is missing", () => {
    const rows = buildOssLicenseRows(payload());
    expect(rows.some((row) => row.id === "chromium")).toBe(false);
  });
});

describe("filterOssLicenseRows", () => {
  it("matches name, license, and version", () => {
    const rows = buildOssLicenseRows(payload({ chromiumAvailable: true }));
    expect(filterOssLicenseRows(rows, "react").map((row) => row.id)).toEqual([
      "react@19.1.0",
    ]);
    expect(filterOssLicenseRows(rows, "fsl").map((row) => row.id)).toEqual([
      "app:cocurdex",
    ]);
    expect(filterOssLicenseRows(rows, "10.3").map((row) => row.id)).toEqual([
      "native:fd",
    ]);
    expect(filterOssLicenseRows(rows, "chromium").map((row) => row.id)).toEqual(
      ["chromium"],
    );
  });

  it("returns the original rows for an empty query", () => {
    const rows = [chromiumLicenseRow()];
    expect(filterOssLicenseRows(rows, "  ")).toBe(rows);
  });
});
