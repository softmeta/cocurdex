import { createSyncEngine } from "@cocurdex/client-runtime";
import type { SyncPullInput, SyncPullResult } from "@cocurdex/shared";
import { describe, expect, it, vi } from "vitest";

function result(overrides: Partial<SyncPullResult> = {}): SyncPullResult {
  return {
    mode: "full",
    cursor: "cursor-1",
    epoch: "epoch",
    eventSeq: 0,
    sessions: [],
    removedSessionIds: [],
    queuedAgentInputs: [],
    queuedMessages: [],
    activeRuns: [],
    sessionUsage: {},
    interactions: { permissions: [], questions: [], planApprovals: [] },
    transcripts: {},
    pausedQueueSessionIds: [],
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

describe("createSyncEngine", () => {
  it("pulls from the last cursor and asks for deltas only for hydrated sessions", async () => {
    const pull = vi.fn(async (_input: SyncPullInput) =>
      result({ cursor: "cursor-2" }),
    );
    const engine = createSyncEngine<string>({
      pull,
      scope: () => ({ sessionIds: ["open"], hydratedSessionIds: ["open"] }),
      apply: vi.fn(),
      applyEvent: vi.fn(),
    });
    engine.setCursor("cursor-1");

    await engine.synchronize(["handoff"]);
    await engine.synchronize();

    expect(pull.mock.calls.map(([input]) => input)).toEqual([
      {
        sessionIds: ["handoff", "open"],
        hydratedSessionIds: ["open"],
        cursor: "cursor-1",
      },
      {
        sessionIds: ["handoff", "open"],
        hydratedSessionIds: ["open"],
        cursor: "cursor-2",
      },
    ]);
    expect(engine.getCursor()).toBe("cursor-2");
  });

  it("folds requests made during a pull into one follow-up pull from the new cursor", async () => {
    const first = deferred<SyncPullResult>();
    const pull = vi
      .fn<(input: SyncPullInput) => Promise<SyncPullResult>>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(result({ cursor: "cursor-3" }));
    const engine = createSyncEngine<string>({
      pull,
      scope: () => ({ sessionIds: [], hydratedSessionIds: [] }),
      apply: vi.fn(),
      applyEvent: vi.fn(),
    });

    const initial = engine.synchronize(["a"]);
    const later = engine.synchronize(["b"]);
    const latest = engine.synchronize(["c"]);
    first.resolve(result({ cursor: "cursor-2" }));
    await Promise.all([initial, later, latest]);

    expect(pull.mock.calls.map(([input]) => input)).toEqual([
      { sessionIds: ["a"], hydratedSessionIds: [], cursor: null },
      {
        sessionIds: ["a", "b", "c"],
        hydratedSessionIds: [],
        cursor: "cursor-2",
      },
    ]);
    expect(engine.getCursor()).toBe("cursor-3");
  });

  it("holds live events during a pull and replays only those past its boundary", async () => {
    const pending = deferred<SyncPullResult>();
    const applied: string[] = [];
    const engine = createSyncEngine<string>({
      pull: () => pending.promise,
      scope: () => ({ sessionIds: [], hydratedSessionIds: [] }),
      apply: () => applied.push("pull"),
      applyEvent: (event) => applied.push(event),
    });

    const synchronization = engine.synchronize();
    engine.handleEvent("covered", { epoch: "epoch", seq: 10 });
    engine.handleEvent("newer", { epoch: "epoch", seq: 11 });
    engine.handleEvent("other epoch", { epoch: "previous", seq: 3 });
    pending.resolve(result({ eventSeq: 10 }));
    await synchronization;
    engine.handleEvent("live", { epoch: "epoch", seq: 12 });

    expect(applied).toEqual(["pull", "newer", "other epoch", "live"]);
  });

  it("keeps the old cursor when a pull fails and retries", async () => {
    const pull = vi
      .fn<(input: SyncPullInput) => Promise<SyncPullResult>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(result({ cursor: "cursor-2" }));
    const engine = createSyncEngine<string>({
      pull,
      scope: () => ({ sessionIds: [], hydratedSessionIds: [] }),
      apply: vi.fn(),
      applyEvent: vi.fn(),
      retryDelayMs: () => 0,
    });
    engine.setCursor("cursor-1");

    await engine.synchronize();

    expect(pull.mock.calls.map(([input]) => input.cursor)).toEqual([
      "cursor-1",
      "cursor-1",
    ]);
    expect(engine.getCursor()).toBe("cursor-2");
  });

  it("gives up after the attempt limit and releases held events", async () => {
    const applied: string[] = [];
    const engine = createSyncEngine<string>({
      pull: () => Promise.reject(new Error("down")),
      scope: () => ({ sessionIds: [], hydratedSessionIds: [] }),
      apply: vi.fn(),
      applyEvent: (event) => applied.push(event),
      maxAttempts: 2,
      retryDelayMs: () => 0,
    });

    const synchronization = engine.synchronize();
    engine.handleEvent("held", { epoch: "epoch", seq: 1 });

    await expect(synchronization).rejects.toThrow("down");
    expect(applied).toEqual(["held"]);
  });
});
