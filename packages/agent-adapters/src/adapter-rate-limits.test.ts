import { describe, expect, it, vi } from "vitest";
import { readAdapterRateLimits } from "./adapter-rate-limits";

describe("readAdapterRateLimits", () => {
  it("probes only the requested plan-usage adapters in parallel", async () => {
    const claude = vi.fn(async () => ({
      windows: [{ kind: "five-hour" as const, usedPercent: 10 }],
      updatedAt: "2026-09-04T00:00:00.000Z",
    }));
    const codex = vi.fn(async () => ({
      windows: [{ kind: "weekly" as const, usedPercent: 20 }],
      updatedAt: "2026-09-04T00:00:00.000Z",
    }));
    const grok = vi.fn(async () => {
      throw new Error("should not run");
    });

    const result = await readAdapterRateLimits(["claude-agent", "codex"], {
      "claude-agent": claude,
      codex,
      "grok-build": grok,
    });

    expect(claude).toHaveBeenCalledOnce();
    expect(codex).toHaveBeenCalledOnce();
    expect(grok).not.toHaveBeenCalled();
    expect(result["claude-agent"]).toEqual({
      status: "available",
      rateLimits: expect.objectContaining({
        windows: [expect.objectContaining({ usedPercent: 10 })],
      }),
    });
    expect(result.codex).toEqual({
      status: "available",
      rateLimits: expect.objectContaining({
        windows: [expect.objectContaining({ usedPercent: 20 })],
      }),
    });
    expect(result["grok-build"]).toBeUndefined();
  });

  it("isolates a failing probe so the others still return", async () => {
    const result = await readAdapterRateLimits(
      ["claude-agent", "codex", "grok-build"],
      {
        "claude-agent": async () => {
          throw new Error("sdk down");
        },
        codex: async () => ({
          windows: [{ kind: "five-hour", usedPercent: 5 }],
          updatedAt: "2026-09-04T00:00:00.000Z",
        }),
        "grok-build": async () => null,
      },
    );

    expect(result["claude-agent"]).toEqual({
      status: "error",
      code: "probe-failed",
      message: "sdk down",
    });
    expect(result.codex).toEqual({
      status: "available",
      rateLimits: expect.objectContaining({
        windows: [expect.objectContaining({ kind: "five-hour" })],
      }),
    });
    expect(result["grok-build"]).toEqual({ status: "unavailable" });
  });
});
