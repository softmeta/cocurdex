import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectUniqueTexts,
  flattenPnpmLicenses,
  isExcludedPackage,
  licenseFileNameFromDirents,
  makePackageId,
  parsePnpmLicensesJson,
  readLicenseText,
  sortOssLicenseEntries,
  uniqueId,
} from "./oss-licenses-generate-lib.mjs";

describe("parsePnpmLicensesJson", () => {
  it("extracts JSON even when pnpm prints warnings around it", () => {
    const parsed = parsePnpmLicensesJson(
      'warn ignored\n{"MIT":[{"name":"left-pad","versions":["1.0.0"]}]}\n',
    );
    expect(parsed.MIT[0].name).toBe("left-pad");
  });

  it("throws when stdout has no JSON object", () => {
    expect(() => parsePnpmLicensesJson("no licenses here")).toThrow(
      /did not return JSON/,
    );
  });
});

describe("isExcludedPackage", () => {
  it("drops Cocurdex workspace packages and build tooling", () => {
    expect(isExcludedPackage("@cocurdex/shared")).toBe(true);
    expect(isExcludedPackage("@cocurdex/desktop")).toBe(true);
    expect(isExcludedPackage("typescript")).toBe(true);
    expect(isExcludedPackage("vitest")).toBe(true);
    expect(isExcludedPackage("@types/react")).toBe(true);
    expect(isExcludedPackage("@electron/rebuild")).toBe(true);
    expect(isExcludedPackage("app-builder-lib")).toBe(true);
  });

  it("keeps runtime and bundled UI packages", () => {
    expect(isExcludedPackage("react")).toBe(false);
    expect(isExcludedPackage("electron")).toBe(false);
    expect(isExcludedPackage("node-pty")).toBe(false);
    expect(isExcludedPackage("monaco-editor")).toBe(false);
  });
});

describe("flattenPnpmLicenses", () => {
  it("pairs versions with paths and falls back to the group license", () => {
    const items = flattenPnpmLicenses({
      MIT: [
        {
          homepage: "https://example.com/left-pad",
          name: "left-pad",
          paths: ["/tmp/left-pad-1", "/tmp/left-pad-2"],
          versions: ["1.0.0", "2.0.0"],
        },
      ],
      "Apache-2.0": [
        {
          license: "Apache-2.0",
          name: "once",
          paths: ["/tmp/once"],
          versions: ["1.4.0"],
        },
      ],
    });
    expect(items).toEqual([
      {
        homepage: "https://example.com/left-pad",
        license: "MIT",
        name: "left-pad",
        packagePath: "/tmp/left-pad-1",
        version: "1.0.0",
      },
      {
        homepage: "https://example.com/left-pad",
        license: "MIT",
        name: "left-pad",
        packagePath: "/tmp/left-pad-2",
        version: "2.0.0",
      },
      {
        homepage: null,
        license: "Apache-2.0",
        name: "once",
        packagePath: "/tmp/once",
        version: "1.4.0",
      },
    ]);
  });
});

describe("licenseFileNameFromDirents", () => {
  it("prefers LICENSE over NOTICE", () => {
    expect(
      licenseFileNameFromDirents(["README.md", "NOTICE", "LICENSE.md"]),
    ).toBe("LICENSE.md");
  });

  it("returns null when no license file is present", () => {
    expect(licenseFileNameFromDirents(["package.json", "README.md"])).toBe(
      null,
    );
  });
});

describe("ids and text collection", () => {
  it("builds unique package ids", () => {
    const seen = new Set<string>();
    expect(uniqueId(makePackageId("left-pad", "1.0.0"), seen)).toBe(
      "left-pad@1.0.0",
    );
    expect(uniqueId(makePackageId("left-pad", "1.0.0"), seen)).toBe(
      "left-pad@1.0.0#2",
    );
  });

  it("deduplicates identical license texts and sorts kinds", () => {
    const mit = "MIT text";
    const collected = collectUniqueTexts([
      {
        homepage: null,
        id: "pkg:b",
        kind: "package",
        license: "MIT",
        name: "zeta",
        text: mit,
        version: "1.0.0",
      },
      {
        homepage: null,
        id: "app:cocurdex",
        kind: "app",
        license: "FSL-1.1-ALv2",
        name: "Cocurdex",
        text: "FSL",
        version: "0.1.3",
      },
      {
        homepage: null,
        id: "pkg:a",
        kind: "package",
        license: "MIT",
        name: "alpha",
        text: mit,
        version: "2.0.0",
      },
    ]);
    expect(collected.entries.map((entry) => entry.id)).toEqual([
      "app:cocurdex",
      "pkg:a",
      "pkg:b",
    ]);
    expect(Object.keys(collected.texts)).toHaveLength(2);
    expect(collected.entries[1]?.textId).toBe(collected.entries[2]?.textId);
  });

  it("sorts app then native then packages", () => {
    const sorted = sortOssLicenseEntries([
      {
        homepage: null,
        id: "pkg",
        kind: "package",
        license: "MIT",
        name: "alpha",
        textId: null,
        version: "1.0.0",
      },
      {
        homepage: null,
        id: "native",
        kind: "native",
        license: "MIT",
        name: "fd",
        textId: null,
        version: "10.3.0",
      },
      {
        homepage: null,
        id: "app",
        kind: "app",
        license: "FSL-1.1-ALv2",
        name: "Cocurdex",
        textId: null,
        version: "0.1.3",
      },
    ]);
    expect(sorted.map((entry) => entry.kind)).toEqual([
      "app",
      "native",
      "package",
    ]);
  });
});

describe("readLicenseText", () => {
  it("reads the preferred license file from a package directory", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "cocurdex-oss-license-"));
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "NOTICE"), "notice");
    await writeFile(path.join(dir, "LICENSE.md"), "  MIT text  \n");
    await expect(readLicenseText(dir)).resolves.toBe("MIT text");
  });
});
