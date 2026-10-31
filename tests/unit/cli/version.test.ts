import { getCliVersion } from "@cocurdex/cli/internal/version";
import { describe, expect, it } from "vitest";

describe("getCliVersion", () => {
  it("returns a semver-like string from package.json in dev", () => {
    const version = getCliVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
