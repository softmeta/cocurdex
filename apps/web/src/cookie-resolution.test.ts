import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guards against parent-directory node_modules (e.g. ~/node_modules/cookie@0.7)
 * shadowing Astro 7's cookie@2 during resolution.
 */
describe("cookie resolution for Astro 7", () => {
  it("resolves workspace cookie@2 with parseCookie", () => {
    const require = createRequire(import.meta.url);
    const monorepoRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../..",
    );
    const resolved = path.normalize(require.resolve("cookie"));
    const api = require("cookie") as {
      parseCookie?: unknown;
      parse?: unknown;
    };

    expect(
      resolved.startsWith(path.normalize(monorepoRoot)),
      `cookie resolved outside monorepo: ${resolved}`,
    ).toBe(true);
    // cookie@2 API (Astro 7). cookie@0.7 only exposes parse/serialize.
    expect(typeof api.parseCookie).toBe("function");
    expect(api.parse).toBeUndefined();
  });
});
