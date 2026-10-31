import { parsePiMemoryDigest } from "@cocurdex/agent-adapters/internal/pi-sdk/pi-memory";
import { describe, expect, it } from "vitest";

describe("parsePiMemoryDigest", () => {
  it("keeps the three memory body lines on separate lines", () => {
    const digest = parsePiMemoryDigest(
      JSON.stringify({
        title: "Session summary",
        importance: "important",
        body: "【前因】user asked about recall\n【行为】we inspected the daemon\n【后果】recall failure is visible",
      }),
    );
    expect(digest?.body.split("\n")).toEqual([
      "【前因】user asked about recall",
      "【行为】we inspected the daemon",
      "【后果】recall failure is visible",
    ]);
  });

  it("collapses indentation inside a line without merging lines", () => {
    const digest = parsePiMemoryDigest(
      JSON.stringify({
        title: "Session summary",
        body: "【前因】  two spaces\n\n【后果】  done",
      }),
    );
    expect(digest?.body).toBe("【前因】 two spaces\n【后果】 done");
  });

  it("rejects a body without the memory markers", () => {
    expect(
      parsePiMemoryDigest(JSON.stringify({ title: "t", body: "plain text" })),
    ).toBeNull();
  });
});
