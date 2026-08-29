import { describe, expect, it } from "vitest";
import { getCliVersion } from "./version";

describe("getCliVersion", () => {
  it("returns a semver-like string from package.json in dev", () => {
    const version = getCliVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
