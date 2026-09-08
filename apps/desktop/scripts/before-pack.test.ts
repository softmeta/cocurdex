import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import beforePack from "./before-pack.mjs";

const builderRequire = createRequire(
  createRequire(import.meta.url).resolve("electron-builder"),
);
const { doMergeConfigs } = builderRequire(
  "app-builder-lib/out/util/config/config.js",
);
const { getMainFileMatchers, getNodeModuleFileMatcher } = builderRequire(
  "app-builder-lib/out/fileMatcher.js",
);

it.each([
  "linux",
  "mac",
  "win",
])("keeps the normalized %s app whitelist", (platform) => {
  const { build } = JSON.parse(
    readFileSync(
      path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../package.json",
      ),
      "utf8",
    ),
  );
  const config = doMergeConfigs([build]);
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
  const dependencyMatcher = getNodeModuleFileMatcher(
    appDir,
    path.join(appDir, "destination"),
    (value: string) => value,
    config[platform],
    { config, debugLogger: { isEnabled: false } },
  );
  const acceptsDependency = (file: string) =>
    dependencyMatcher.createFilter()(path.join(appDir, "node_modules", file), {
      isDirectory: () => false,
    });
  expect(acceptsDependency("pi-mcp-adapter/index.ts")).toBe(true);
  expect(acceptsDependency("pi-mcp-adapter/proxy-modes.ts")).toBe(true);
  expect(acceptsDependency("pi-mcp-adapter/banner.png")).toBe(false);
  expect(acceptsDependency("pi-mcp-adapter/index.ts.map")).toBe(false);
  expect(acceptsDependency("other-package/index.ts")).toBe(false);
});

const x64 = 1;
const arm64 = 3;

describe("beforePack", () => {
  it("copies root includes onto the platform files list so ignore-only override cannot pack the app tree", () => {
    const extraResources = [{ from: "vendor/fd", to: "vendor/fd" }];
    const config: {
      files: string[];
      linux: {
        extraResources: typeof extraResources;
        files?: { filter: string[] }[];
      };
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
    expect(config.linux.files?.[0].filter).toContain("out/**");
    expect(
      config.linux.files?.[0].filter.some(
        (pattern) => !pattern.startsWith("!"),
      ),
    ).toBe(true);
    expect(config.linux.files?.[0].filter).toContain(
      "!**/node_modules/@napi-rs/keyring-linux-arm64-gnu/**/*",
    );
    expect(config.linux.files?.[0].filter).not.toContain(
      "!**/node_modules/@napi-rs/keyring-linux-x64-gnu/**/*",
    );
  });

  it("replaces Mac excludes per arch instead of stacking them", () => {
    const config: { files: string[]; mac: { files?: { filter: string[] }[] } } =
      {
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

    expect(config.mac.files?.[0].filter).toContain("out/**");
    expect(config.mac.files?.[0].filter).toContain(
      "!**/node_modules/@mariozechner/clipboard-darwin-arm64/**/*",
    );
    expect(config.mac.files?.[0].filter).not.toContain(
      "!**/node_modules/@mariozechner/clipboard-darwin-x64/**/*",
    );
  });
});
