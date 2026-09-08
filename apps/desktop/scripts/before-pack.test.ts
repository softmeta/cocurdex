import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import beforePack from "./before-pack.mjs";

const builderRequire = createRequire(
  createRequire(import.meta.url).resolve("electron-builder"),
);
const { doMergeConfigs } = builderRequire(
  "app-builder-lib/out/util/config/config.js",
);
const { getMainFileMatchers } = builderRequire(
  "app-builder-lib/out/fileMatcher.js",
);

it.each([
  "linux",
  "mac",
  "win",
])("keeps the normalized %s app whitelist", (platform) => {
  const config = doMergeConfigs([{ files: ["out/**"], [platform]: {} }]);
  beforePack({
    packager: { config },
    arch: x64,
    electronPlatformName: { linux: "linux", mac: "darwin", win: "win32" }[
      platform
    ],
  });
  const appDir = path.resolve("fixture-app");
  const matchers = getMainFileMatchers(
    appDir,
    path.join(appDir, "destination"),
    (value: string) => value,
    config[platform],
    {
      info: {
        config,
        projectDir: appDir,
        buildResourcesDir: "build-assets",
        debugLogger: { isEnabled: false },
      },
      getNodeDependencyInfo: () => null,
    },
    path.join(appDir, "release"),
    false,
  );
  const accepts = (file: string) =>
    matchers.some(
      (matcher: {
        createFilter: () => (
          file: string,
          stat: { isDirectory: () => boolean },
        ) => boolean;
      }) =>
        matcher.createFilter()(path.join(appDir, file), {
          isDirectory: () => false,
        }),
    );
  expect(accepts("out/main/main.js")).toBe(true);
  expect(accepts("src/main.tsx")).toBe(false);
  expect(accepts("electron/main.ts")).toBe(false);
  expect(accepts("scripts/before-pack.mjs")).toBe(false);
  expect(accepts("electron.vite.config.ts")).toBe(false);
});

const x64 = 1;
const arm64 = 3;

describe("beforePack", () => {
  it("copies root includes onto the platform files list so ignore-only override cannot pack the app tree", () => {
    const extraResources = [{ from: "vendor/fd", to: "vendor/fd" }];
    const config: {
      files: string[];
      linux: { extraResources: typeof extraResources; files?: string[] };
    } = {
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
    const config: { files: string[]; mac: { files?: string[] } } = {
      files: ["out/**"],
      mac: {},
    };

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
