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

  it("keeps an in-flight receipt past the ttl and starts retention on settle", async () => {
    vi.useFakeTimers();
    try {
      const store = createDaemonReceiptStore({ ttlMs: 1000 });
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const run = vi.fn(async () => {
        await gate;
        return { ok: true as const, result: "late" };
      });

      const first = store.execute("m:k5", run);
      // The operation is still running well past the retention window; a
      // duplicate must coalesce instead of starting a second execution.
      vi.advanceTimersByTime(60_000);
      const second = store.execute("m:k5", run);
      release();

      const [firstResult, secondResult] = await Promise.all([first, second]);
      expect(run).toHaveBeenCalledTimes(1);
      expect(secondResult.replayed).toBe(true);
      expect(firstResult.outcome).toEqual(secondResult.outcome);

      // Retention counts from settlement, not from request start.
      vi.advanceTimersByTime(999);
      expect((await store.execute("m:k5", run)).replayed).toBe(true);
      expect(run).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("evicts only settled receipts under capacity pressure", async () => {
    const store = createDaemonReceiptStore({ maxEntries: 2, ttlMs: 60_000 });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const running = vi.fn(async () => {
      await gate;
      return { ok: true as const, result: "running" };
    });
    const instant = vi.fn(async () => ({ ok: true as const, result: "done" }));

    const first = store.execute("m:in-flight", running);
    await store.execute("m:a", instant);
    await store.execute("m:b", instant);
    await store.execute("m:c", instant);

    // Settled receipts a and b were evicted; the in-flight receipt survives.
    const duplicate = store.execute("m:in-flight", running);
    release();
    await Promise.all([first, duplicate]);
    expect(running).toHaveBeenCalledTimes(1);
  });
});
