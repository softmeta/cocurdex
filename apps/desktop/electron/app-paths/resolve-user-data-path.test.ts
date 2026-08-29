import { describe, expect, it } from "vitest";
import { resolveUserDataPath } from "./resolve-user-data-path";

describe("resolveUserDataPath", () => {
  it("keeps the default path for packaged builds", () => {
    expect(
      resolveUserDataPath(
        "/Users/x/Library/Application Support/Cocurdex",
        true,
      ),
    ).toBe("/Users/x/Library/Application Support/Cocurdex");
  });

  it("appends a -dev suffix for non-packaged (local dev) builds", () => {
    expect(
      resolveUserDataPath(
        "/Users/x/Library/Application Support/Cocurdex",
        false,
      ),
    ).toBe("/Users/x/Library/Application Support/Cocurdex-dev");
  });

  it("isolates dev data from packaged data so they never share a directory", () => {
    const base = "/Users/x/Library/Application Support/Cocurdex";
    expect(resolveUserDataPath(base, false)).not.toBe(
      resolveUserDataPath(base, true),
    );
  });
});
