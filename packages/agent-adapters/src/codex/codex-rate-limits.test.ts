import { describe, expect, it, vi } from "vitest";
import { parseCodexRateLimits, readCodexRateLimits } from "./codex-rate-limits";

describe("parseCodexRateLimits", () => {
  it("maps Codex primary and secondary windows", () => {
    const result = parseCodexRateLimits({
      rateLimits: {
        primary: {
          usedPercent: 25,
          windowDurationMins: 300,
          resetsAt: 1_738_425_600,
        },
        secondary: {
          usedPercent: 40,
          windowDurationMins: 10_080,
          resetsAt: 1_738_857_600,
        },
      },
    });

    expect(result?.windows).toEqual([
      expect.objectContaining({ kind: "five-hour", usedPercent: 25 }),
      expect.objectContaining({ kind: "weekly", usedPercent: 40 }),
    ]);
  });

  it("accepts sparse update parameters", () => {
    expect(
      parseCodexRateLimits({
        rateLimits: {
          primary: { usedPercent: 50, windowDurationMins: 15 },
        },
      })?.windows,
    ).toEqual([expect.objectContaining({ kind: "primary", usedPercent: 50 })]);
  });
});

describe("readCodexRateLimits", () => {
  it("reads ChatGPT plan windows from the app-server", async () => {
    const release = vi.fn();
    const request = vi.fn(async () => ({
      rateLimits: {
        primary: { usedPercent: 30, windowDurationMins: 300 },
        secondary: { usedPercent: 12, windowDurationMins: 10_080 },
      },
    }));

    const record = await readCodexRateLimits(
      () =>
        ({
          client: { request },
          release,
        }) as never,
    );

    expect(request).toHaveBeenCalledWith("account/rateLimits/read");
    expect(record?.windows).toEqual([
      expect.objectContaining({ kind: "five-hour", usedPercent: 30 }),
      expect.objectContaining({ kind: "weekly", usedPercent: 12 }),
    ]);
    expect(release).toHaveBeenCalledOnce();
  });

  it("returns null and still releases the client when the read fails", async () => {
    const release = vi.fn();

    await expect(
      readCodexRateLimits(
        () =>
          ({
            client: {
              request: vi.fn(async () => {
                throw new Error("not signed in");
              }),
            },
            release,
          }) as never,
      ),
    ).resolves.toBeNull();
    expect(release).toHaveBeenCalledOnce();
  });
});
