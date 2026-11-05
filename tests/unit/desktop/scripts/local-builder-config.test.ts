import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { stagedLocalBuilderConfig } from "@desktop/scripts/local-builder-config.mjs";
import { describe, expect, it } from "vitest";
import { packagedAppFiles } from "./packaged-app-files";

const { build } = JSON.parse(
  readFileSync(
    createRequire(import.meta.url).resolve("@cocurdex/desktop/package.json"),
    "utf8",
  ),
);

const staged = {
  stagedOutDir: "release/.local-stage/out",
  stagedCliDir: "release/.local-stage/cli",
  outputDir: "release/local",
};

describe("staged local builder config", () => {
  it.each(["linux", "mac", "win"] as const)(
    "packs the staged %s app build and nothing else from the project tree",
    (platform) => {
      const config = stagedLocalBuilderConfig(build, staged);
      const { accepts, acceptsDependency } = packagedAppFiles(config, platform);

      expect(accepts("release/.local-stage/out/main/main.js")).toBe(true);
      expect(accepts("out/main/main.js")).toBe(false);
      expect(accepts("src/main.tsx")).toBe(false);
      expect(accepts("electron/main.ts")).toBe(false);
      expect(accepts("release/local/latest-mac.yml")).toBe(false);
      expect(accepts("resources/cli/daemon.cjs")).toBe(false);
      expect(acceptsDependency("quickjs-wasi/quickjs.wasm")).toBe(true);
    },
  );

  it("copies the staged CLI instead of the shared one", () => {
    const config = stagedLocalBuilderConfig(build, staged);

    const cliResource = config.extraResources.find(
      (entry: { to?: string }) => entry.to === "cli",
    );
    expect(cliResource.from).toBe(staged.stagedCliDir);
    expect(JSON.stringify(config)).not.toContain('"resources/cli"');
  });

  it("writes to the local output folder without notarizing", () => {
    const config = stagedLocalBuilderConfig(build, staged);

    expect(config.directories.output).toBe("release/local");
    expect(config.mac.notarize).toBe(false);
    expect(build.directories.output).toBe("release");
  });

  it("refuses a config that no longer packages the shared output it replaces", () => {
    expect(() =>
      stagedLocalBuilderConfig({ ...build, files: ["dist/**"] }, staged),
    ).toThrow("out/**");
  });
});
