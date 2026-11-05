import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import beforePack from "@desktop/scripts/before-pack.mjs";
import { describe, expect, it } from "vitest";
import { packagedAppFiles } from "./packaged-app-files";

it.each(["linux", "mac", "win"] as const)(
  "keeps the normalized %s app whitelist",
  (platform) => {
    const { build } = JSON.parse(
      readFileSync(
        createRequire(import.meta.url).resolve(
          "@cocurdex/desktop/package.json",
        ),
        "utf8",
      ),
    );
    const { accepts, acceptsDependency } = packagedAppFiles(build, platform);
    expect(accepts("out/main/main.js")).toBe(true);
    expect(accepts("src/main.tsx")).toBe(false);
    expect(accepts("electron/main.ts")).toBe(false);
    expect(accepts("scripts/before-pack.mjs")).toBe(false);
    expect(accepts("electron.vite.config.ts")).toBe(false);
    expect(acceptsDependency("quickjs-wasi/quickjs.wasm")).toBe(true);
    expect(
      acceptsDependency("@earendil-works/pi-coding-agent/dist/bundle/cli.js"),
    ).toBe(false);
    expect(
      acceptsDependency("@earendil-works/pi-coding-agent/dist/index.js"),
    ).toBe(true);
    expect(acceptsDependency("other-package/index.js.map")).toBe(false);
    expect(acceptsDependency("other-package/index.ts")).toBe(false);
  },
);

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
      "!**/node_modules/@napi-rs/keyring-darwin-arm64/**/*",
    );
    expect(config.mac.files?.[0].filter).not.toContain(
      "!**/node_modules/@napi-rs/keyring-darwin-x64/**/*",
    );
  });
});
