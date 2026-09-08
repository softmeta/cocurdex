import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const piPackageDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../node_modules/@earendil-works/pi-coding-agent",
);
const piPackage = JSON.parse(
  readFileSync(join(piPackageDir, "package.json"), "utf8"),
) as {
  exports: { ".": { import?: string; require?: string; default?: string } };
};

describe("mac native optional dependencies", () => {
  it("installs both darwin CPU optional packages for Intel cross-builds", () => {
    const workspace = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../../pnpm-workspace.yaml",
      ),
      "utf8",
    ).replaceAll("\r\n", "\n");
    expect(workspace).toContain("supportedArchitectures:");
    expect(workspace).toMatch(/cpu:\n[ \t]+- x64\n[ \t]+- arm64\n/);
  });

  it("filters foreign-arch natives in beforePack instead of a static files glob", () => {
    const desktopPackage = JSON.parse(
      readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), "../package.json"),
        "utf8",
      ),
    ) as { build: { beforePack?: string; files: string[] } };
    expect(desktopPackage.build.beforePack).toBe("./scripts/before-pack.mjs");
    expect(
      desktopPackage.build.files.some((pattern) =>
        pattern.includes("clipboard-darwin-x64"),
      ),
    ).toBe(false);
  });
});

describe("packaged Pi SDK resolution", () => {
  it("is ESM-only, so CJS require.resolve cannot load the package root", () => {
    expect(piPackage.exports["."].import).toBe("./dist/index.js");
    expect(piPackage.exports["."]).not.toHaveProperty("require");
    expect(piPackage.exports["."]).not.toHaveProperty("default");

    const requireFromPackage = createRequire(
      join(piPackageDir, "package.json"),
    );
    expect(() =>
      requireFromPackage.resolve("@earendil-works/pi-coding-agent"),
    ).toThrow(/ERR_PACKAGE_PATH_NOT_EXPORTED|No "exports" main defined/);
  });

  it("keeps yaml dist/doc in the packaged asar", () => {
    const desktopPackage = JSON.parse(
      readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), "../package.json"),
        "utf8",
      ),
    ) as { build: { files: string[] } };
    const stripRuntimeDocs = desktopPackage.build.files.find((pattern) =>
      pattern.includes("{demo,demos,"),
    );
    expect(stripRuntimeDocs).toBeDefined();
    const names = stripRuntimeDocs?.match(/\{([^}]+)\}/)?.[1]?.split(",") ?? [];
    expect(names).toContain("docs");
    expect(names).not.toContain("doc");
  });

  it("loads ModelRuntime through the ESM export path", async () => {
    const relativeImport = piPackage.exports["."].import;
    if (typeof relativeImport !== "string") {
      throw new Error("expected ESM import export");
    }
    const { ModelRuntime } = await import(
      pathToFileURL(join(piPackageDir, relativeImport)).href
    );
    expect(typeof ModelRuntime?.create).toBe("function");
  });
});
