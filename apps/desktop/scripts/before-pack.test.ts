import { describe, expect, it } from "vitest";
import beforePack from "./before-pack.mjs";

const x64 = 1;
const arm64 = 3;

describe("beforePack", () => {
  it("copies root includes onto the platform files list so ignore-only override cannot pack the app tree", () => {
    const extraResources = [{ from: "vendor/fd", to: "vendor/fd" }];
    const config = {
      files: ["out/**", "!node_modules/**/*.map"],
      linux: { extraResources },
    };

    beforePack({
      packager: { config },
      arch: x64,
      electronPlatformName: "linux",
    });

    expect(config.files).toEqual(["out/**", "!node_modules/**/*.map"]);
    expect(config.linux.extraResources).toBe(extraResources);
    expect(config.linux.files).toContain("out/**");
    expect(
      config.linux.files?.some((pattern) => !pattern.startsWith("!")),
    ).toBe(true);
    expect(config.linux.files).toContain(
      "!**/node_modules/@napi-rs/keyring-linux-arm64-gnu/**/*",
    );
    expect(config.linux.files).not.toContain(
      "!**/node_modules/@napi-rs/keyring-linux-x64-gnu/**/*",
    );
  });

  it("replaces Mac excludes per arch instead of stacking them", () => {
    const config = { files: ["out/**"], mac: {} };

    beforePack({
      packager: { config },
      arch: arm64,
      electronPlatformName: "darwin",
    });
    beforePack({
      packager: { config },
      arch: x64,
      electronPlatformName: "darwin",
    });

    expect(config.mac.files).toContain("out/**");
    expect(config.mac.files).toContain(
      "!**/node_modules/@mariozechner/clipboard-darwin-arm64/**/*",
    );
    expect(config.mac.files).not.toContain(
      "!**/node_modules/@mariozechner/clipboard-darwin-x64/**/*",
    );
  });
});
