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
