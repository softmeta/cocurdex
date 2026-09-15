import { describe, expect, it, vi } from "vitest";
import { createDaemonReceiptStore } from "./rpc-receipts";

describe("createDaemonReceiptStore", () => {
  it("runs a keyed operation once and replays the outcome", async () => {
    const store = createDaemonReceiptStore();
    const run = vi.fn(async () => ({ ok: true as const, result: 42 }));

    const first = await store.execute("m:k1", run);
    const second = await store.execute("m:k1", run);

    expect(run).toHaveBeenCalledTimes(1);
    expect(first).toEqual({
      outcome: { ok: true, result: 42 },
      replayed: false,
    });
    expect(second).toEqual({
      outcome: { ok: true, result: 42 },
      replayed: true,
    });
  });

  it("coalesces concurrent duplicates onto the in-flight operation", async () => {
    const store = createDaemonReceiptStore();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const run = vi.fn(async () => {
      await gate;
      return { ok: true as const, result: "done" };
    });

    const first = store.execute("m:k2", run);
    const second = store.execute("m:k2", run);
    release();

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(firstResult.replayed).toBe(false);
    expect(secondResult.replayed).toBe(true);
    expect(secondResult.outcome).toEqual({ ok: true, result: "done" });
  });

  it("replays stored error outcomes", async () => {
    const store = createDaemonReceiptStore();
    const run = vi.fn(async () => ({
      ok: false as const,
      error: { code: "REQUEST_FAILED", message: "boom" },
    }));

    const first = await store.execute("m:k3", run);
    const second = await store.execute("m:k3", run);

    expect(first.outcome.ok).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.outcome).toEqual(first.outcome);
  });

  it("expires receipts after the ttl", async () => {
    vi.useFakeTimers();
    try {
      const store = createDaemonReceiptStore({ ttlMs: 1000 });
      const run = vi.fn(async () => ({ ok: true as const, result: 1 }));

      await store.execute("m:k4", run);
      vi.advanceTimersByTime(1001);
      const again = await store.execute("m:k4", run);

      expect(run).toHaveBeenCalledTimes(2);
      expect(again.replayed).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
