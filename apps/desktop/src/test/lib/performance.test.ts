import { describe, expect, it } from "vitest";
import { resolvePerfEnabled } from "@/lib/performance";

describe("performance logging", () => {
  it("stays disabled by default in development", () => {
    expect(
      resolvePerfEnabled({
        getStoredOptIn: () => null,
        mode: "development",
      }),
    ).toBe(false);
  });

  it("allows explicit opt-in outside tests", () => {
    expect(
      resolvePerfEnabled({
        getStoredOptIn: () => "1",
        mode: "development",
      }),
    ).toBe(true);
  });

  it("stays disabled in tests even when opted in", () => {
    expect(
      resolvePerfEnabled({
        getStoredOptIn: () => "1",
        mode: "test",
      }),
    ).toBe(false);
  });
});
