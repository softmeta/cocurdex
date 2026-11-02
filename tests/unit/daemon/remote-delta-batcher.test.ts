import { createRemoteDeltaBatcher } from "@cocurdex/daemon/internal/remote-delta-batcher";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function delta(seq: number, text: string, messageId = "m1") {
  return {
    type: "daemon.event",
    seq,
    event: {
      type: "message.delta",
      sessionId: "s1",
      messageId,
      role: "assistant",
      kind: "response",
      delta: text,
      createdAt: "2026-11-02T00:00:00.000Z",
    },
  };
}

function deltasOf(sent: unknown[]) {
  return sent.map((message) => {
    const envelope = message as ReturnType<typeof delta>;
    return envelope.event?.type === "message.delta"
      ? [envelope.seq, envelope.event.messageId, envelope.event.delta]
      : envelope;
  });
}

describe("createRemoteDeltaBatcher", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sends a burst of deltas for one message as one, under the last seq", () => {
    const sent: unknown[] = [];
    const batcher = createRemoteDeltaBatcher((message) => sent.push(message));
    batcher.send(delta(1, "Hel"));
    batcher.send(delta(2, "lo"));
    batcher.send(delta(3, "!"));
    expect(sent).toEqual([]);

    vi.advanceTimersByTime(100);
    expect(deltasOf(sent)).toEqual([[3, "m1", "Hello!"]]);
  });

  it("keeps wire order: anything else flushes the held deltas first", () => {
    const sent: unknown[] = [];
    const batcher = createRemoteDeltaBatcher((message) => sent.push(message));
    const response = { id: 9, result: { content: "Hello" } };
    batcher.send(delta(1, "Hel"));
    batcher.send(delta(2, "lo", "m2"));
    batcher.send(response);

    expect(deltasOf(sent)).toEqual([
      [1, "m1", "Hel"],
      [2, "m2", "lo"],
      response,
    ]);
  });

  it("sends deltas one by one while a snapshot is in flight", () => {
    const sent: unknown[] = [];
    const batcher = createRemoteDeltaBatcher((message) => sent.push(message));
    batcher.send(delta(1, "Hel"));
    batcher.pause();
    batcher.send(delta(2, "lo"));
    batcher.send(delta(3, "!"));
    batcher.resume();
    batcher.send(delta(4, "?"));
    vi.advanceTimersByTime(100);

    expect(deltasOf(sent)).toEqual([
      [1, "m1", "Hel"],
      [2, "m1", "lo"],
      [3, "m1", "!"],
      [4, "m1", "?"],
    ]);
  });

  it("drops held deltas on close so a resumed client replays them by seq", () => {
    const sent: unknown[] = [];
    const batcher = createRemoteDeltaBatcher((message) => sent.push(message));
    batcher.send(delta(1, "Hel"));
    batcher.close();
    vi.advanceTimersByTime(1000);
    expect(sent).toEqual([]);
  });
});
