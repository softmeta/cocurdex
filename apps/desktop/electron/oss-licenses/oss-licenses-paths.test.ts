import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveChromiumLicensesCandidates,
  resolveOssLicensesFilePath,
} from "./oss-licenses-paths";

describe("resolveOssLicensesFilePath", () => {
  it("reads extraResources in packaged builds", () => {
    expect(
      resolveOssLicensesFilePath({
        desktopRoot: "/repo/apps/desktop",
        isPackaged: true,
        resourcesPath: "/App/Contents/Resources",
      }),
    ).toBe(path.join("/App/Contents/Resources", "oss-licenses.json"));
  });

  it("reads the desktop resources folder in development", () => {
    expect(
      resolveOssLicensesFilePath({
        desktopRoot: "/repo/apps/desktop",
        isPackaged: false,
        resourcesPath: "/electron/dist/resources",
      }),
    ).toBe(path.join("/repo/apps/desktop", "resources", "oss-licenses.json"));
  });
});

describe("resolveChromiumLicensesCandidates", () => {
  it("starts with the Electron resources copy", () => {
    const candidates = resolveChromiumLicensesCandidates({
      execPath: "/App/Contents/MacOS/Cocurdex",
      resourcesPath: "/App/Contents/Resources",
    });
    expect(candidates[0]).toBe(
      path.join("/App/Contents/Resources", "LICENSES.chromium.html"),
    );
    expect(candidates).toContain(
      path.join(
        path.dirname("/App/Contents/MacOS/Cocurdex"),
        "LICENSES.chromium.html",
      ),
    );
  });
});
