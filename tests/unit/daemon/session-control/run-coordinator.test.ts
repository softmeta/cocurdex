import {
  type RunStore,
  SessionRunCoordinator,
} from "@cocurdex/daemon/internal/session-control/run-coordinator";
import type { AgentEvent, MessageRecord, RunRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

const reply: MessageRecord = {
  id: "reply",
  sessionId: "s1",
  role: "assistant",
  content: "done",
  attachments: [],
  createdAt: "2026-10-11T00:00:00.000Z",
};

function setup() {
  const rows = new Map<string, RunRecord>();
  const events: AgentEvent[] = [];
  const settled: RunRecord[] = [];
  const ended: RunRecord[] = [];
  let nextId = 0;
  const store: RunStore = {
    async startRun(run) {
      rows.set(run.id, run);
      return run;
    },
    async finishRun(runId, status, endedAt, error) {
      const row = rows.get(runId);
      if (row?.status !== "running") return null;
      const finished = { ...row, status, endedAt, error };
      rows.set(runId, finished);
      return finished;
    },
  };
  const coordinator = new SessionRunCoordinator({
    store,
    emit: (event) => events.push(event),
    afterPersistedEvents: (work) => work(),
    onRunSettled: (run) => settled.push(run),
    onRunEnded: (run) => ended.push(run),
    now: () => "2026-10-11T00:00:00.000Z",
    createId: () => `run-${++nextId}`,
  });
  const statuses = () =>
    events.flatMap((event) =>
      event.type === "state.changed" ? [event.status] : [],
    );
  return { coordinator, rows, events, settled, ended, statuses };
}

describe("SessionRunCoordinator", () => {
  it("owns one run per session from start to completion", async () => {
    const { coordinator, rows, settled, statuses } = setup();
    const handle = await coordinator.start("s1", "m1", "codex");

    expect(coordinator.activeRunId("s1")).toBe("run-1");
    await expect(coordinator.start("s1", "m2", "codex")).rejects.toThrow(
      "already has an active turn",
    );

    const outcome = await coordinator.settle(handle, {
      kind: "resolved",
      message: reply,
    });

    expect(outcome).toEqual({ status: "completed", message: reply });
    expect(rows.get("run-1")?.status).toBe("completed");
    expect(coordinator.hasActiveRun("s1")).toBe(false);
    expect(settled.map((run) => run.id)).toEqual(["run-1"]);
    expect(statuses()).toEqual(["running", "idle"]);
  });

  it("fails the run when the provider reported a terminal error", async () => {
    const { coordinator, rows, statuses } = setup();
    const handle = await coordinator.start("s1", "m1", "codex");
    coordinator.noteProviderEvent({
      type: "error",
      sessionId: "s1",
      message: "quota exceeded",
    });
    coordinator.noteProviderEvent({
      type: "state.changed",
      sessionId: "s1",
      status: "error",
    });

    await expect(
      coordinator.settle(handle, { kind: "resolved", message: reply }),
    ).resolves.toEqual({ status: "failed", error: "quota exceeded" });
    expect(rows.get("run-1")).toMatchObject({
      status: "failed",
      error: "quota exceeded",
    });
    expect(statuses()).toEqual(["running", "error"]);
  });

  it("does not let a provider going idle end the run", async () => {
    const { coordinator } = setup();
    await coordinator.start("s1", "m1", "codex");
    coordinator.noteProviderEvent({
      type: "state.changed",
      sessionId: "s1",
      status: "idle",
    });

    expect(coordinator.hasActiveRun("s1")).toBe(true);
  });

  it("ends a stopped run immediately and ignores its late settlement", async () => {
    const { coordinator, rows, settled, statuses } = setup();
    const handle = await coordinator.start("s1", "m1", "codex");
    const waiting = coordinator.outcomeOf("s1");

    await coordinator.stop("s1");

    expect(handle.signal.aborted).toBe(true);
    expect(coordinator.hasActiveRun("s1")).toBe(false);
    expect(rows.get("run-1")?.status).toBe("cancelled");
    await expect(waiting).resolves.toEqual({ status: "cancelled" });

    const next = await coordinator.start("s1", "m2", "codex");
    await expect(
      coordinator.settle(handle, { kind: "resolved", message: reply }),
    ).resolves.toEqual({ status: "cancelled" });
    expect(coordinator.activeRunId("s1")).toBe(next.runId);
    expect(settled).toEqual([]);
    expect(statuses()).toEqual(["running", "idle", "running"]);
  });

  it("interrupts every active run on shutdown and leaves sessions usable", async () => {
    const { coordinator, rows, statuses } = setup();
    await coordinator.start("s1", "m1", "codex");
    await coordinator.start("s2", "m2", "codex");

    await coordinator.interruptAll();

    expect([...rows.values()].map((run) => run.status)).toEqual([
      "interrupted",
      "interrupted",
    ]);
    expect(coordinator.activeRuns()).toEqual([]);
    expect(statuses()).toEqual(["running", "running", "idle", "idle"]);
  });

  it("releases the session when the run row cannot be written", async () => {
    const { coordinator } = setup();
    const failing = new SessionRunCoordinator({
      store: {
        startRun: async () => {
          throw new Error("disk full");
        },
        finishRun: async () => null,
      },
      emit: () => undefined,
      afterPersistedEvents: (work) => work(),
      onRunSettled: () => undefined,
      now: () => "now",
      createId: () => "run",
    });

    await expect(failing.start("s1", "m1", "codex")).rejects.toThrow(
      "disk full",
    );
    expect(failing.hasActiveRun("s1")).toBe(false);
    expect(coordinator.hasActiveRun("s1")).toBe(false);
  });

  it("fails an expired run with its reason and ignores a stale deadline", async () => {
    const { coordinator, rows, settled, ended, statuses } = setup();
    const handle = await coordinator.start("s1", "m1", "codex");

    expect(await coordinator.expire("s1", "other-run", "late")).toBeNull();
    const expired = await coordinator.expire("s1", handle.runId, "timed out");

    expect(expired).toMatchObject({ status: "failed", error: "timed out" });
    expect(rows.get(handle.runId)?.status).toBe("failed");
    expect(handle.signal.aborted).toBe(true);
    expect(coordinator.hasActiveRun("s1")).toBe(false);
    expect(statuses().at(-1)).toBe("error");
    expect(settled).toEqual([]);
    expect(ended.map((run) => run.status)).toEqual(["failed"]);
    await expect(
      coordinator.settle(handle, { kind: "resolved", message: reply }),
    ).resolves.toEqual({ status: "cancelled" });
  });

  it("reports every way a run ends, not only settlement", async () => {
    const { coordinator, ended } = setup();
    const first = await coordinator.start("s1", "m1", "codex");
    await coordinator.settle(first, { kind: "resolved", message: reply });
    await coordinator.start("s1", "m2", "codex");
    await coordinator.stop("s1");
    await coordinator.start("s2", "m3", "codex");
    await coordinator.interruptAll();

    expect(ended.map((run) => run.status)).toEqual([
      "completed",
      "cancelled",
      "interrupted",
    ]);
  });
});
