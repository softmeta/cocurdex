import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatWindowHandoff } from "./chat-window-transfer";

afterEach(() => vi.useRealTimers());

describe("chat window handoff", () => {
  it("keeps the source responsible until the intended target acknowledges", async () => {
    const handoff = new ChatWindowHandoff();
    const { transfer, completion } = handoff.begin(2, "draft with attachments");
    expect(handoff.forTarget(2)).toEqual(transfer);
    expect(handoff.forTarget(1)).toBeNull();
    expect(handoff.complete(1, transfer.id)).toBe(false);
    expect(handoff.complete(2, "stale-token")).toBe(false);
    expect(handoff.busy).toBe(true);
    expect(handoff.complete(2, transfer.id)).toBe(true);
    await expect(completion).resolves.toBeUndefined();
    expect(handoff.busy).toBe(false);
  });

  it("rejects duplicate transfers without replacing the original draft", async () => {
    const handoff = new ChatWindowHandoff();
    const { transfer, completion } = handoff.begin(2, "original");
    expect(() => handoff.begin(3, "replacement")).toThrow();
    expect(handoff.forTarget(2)?.snapshot).toBe("original");
    handoff.complete(2, transfer.id);
    await completion;
  });

  it("rolls back on timeout and allows a fresh attempt", async () => {
    vi.useFakeTimers();
    const handoff = new ChatWindowHandoff();
    const first = handoff.begin(2, "preserved draft");
    const rejected = expect(first.completion).rejects.toThrow("ready in time");
    await vi.advanceTimersByTimeAsync(30_000);
    await rejected;
    const next = handoff.begin(2, "preserved draft");
    expect(handoff.complete(2, first.transfer.id)).toBe(false);
    handoff.complete(2, next.transfer.id);
    await next.completion;
  });

  it("cancels a failed renderer without accepting its late acknowledgement", async () => {
    const handoff = new ChatWindowHandoff();
    const { transfer, completion } = handoff.begin(2, "draft");
    const rejected = expect(completion).rejects.toThrow("Renderer exited");
    handoff.cancel(new Error("Renderer exited"));
    expect(handoff.complete(2, transfer.id)).toBe(false);
    await rejected;
  });
});
