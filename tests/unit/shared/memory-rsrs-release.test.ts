import {
  compareRsrsVersions,
  rsrsLibcFor,
  rsrsVersionMeetsMinimum,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

describe("rsrs release versions", () => {
  it("orders prerelease numbers numerically and releases after prereleases", () => {
    expect(compareRsrsVersions("rsrs 2.0.0-dev.10", "2.0.0-dev.3")).toBe(1);
    expect(compareRsrsVersions("2.0.0", "2.0.0-dev.99")).toBe(1);
    expect(compareRsrsVersions("1.9.9", "2.0.0-dev.3")).toBe(-1);
    expect(compareRsrsVersions("rsrs (unknown build)", "2.0.0")).toBeNull();
  });

  it("does not pause memory over a version line it cannot read", () => {
    expect(rsrsVersionMeetsMinimum("2.0.0-dev.2")).toBe(false);
    expect(rsrsVersionMeetsMinimum("2.0.0-dev.10")).toBe(true);
    expect(rsrsVersionMeetsMinimum("rsrs (unknown build)")).toBe(true);
  });

  it("runs the musl build where glibc is older than the gnu build needs", () => {
    expect(rsrsLibcFor("2.36")).toBe("musl");
    expect(rsrsLibcFor("2.39")).toBe("glibc");
    expect(rsrsLibcFor("2.41")).toBe("glibc");
    expect(rsrsLibcFor(undefined)).toBe("musl");
  });
});
