import { backoffDelay } from "@cocurdex/client-runtime/internal/backoff";
import { describe, expect, it } from "vitest";

const policy = (random: number) => ({
  baseMs: 500,
  maxMs: 5 * 60_000,
  random: () => random,
});

describe("backoffDelay", () => {
  it("doubles the ceiling per failure and jitters within its upper half", () => {
    expect(backoffDelay(1, policy(1))).toBe(500);
    expect(backoffDelay(1, policy(0))).toBe(250);
    expect(backoffDelay(3, policy(1))).toBe(2000);
    expect(backoffDelay(3, policy(0.5))).toBe(1500);
  });

  it("caps the delay at five minutes", () => {
    expect(backoffDelay(30, policy(1))).toBe(300_000);
    expect(backoffDelay(1000, policy(0))).toBe(150_000);
  });

  it("treats a first attempt without failures like the first failure", () => {
    expect(backoffDelay(0, policy(1))).toBe(500);
  });
});
