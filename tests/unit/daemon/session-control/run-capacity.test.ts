import { RunCapacity } from "@cocurdex/daemon/internal/session-control/run-capacity";
import type {
  AgentId,
  AgentRunLimits,
  RunRecord,
  SessionRecord,
} from "@cocurdex/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

function session(
  id: string,
  agentType: AgentId,
  sessionKind: SessionRecord["sessionKind"] = "teammate",
): SessionRecord {
  return {
    id,
    workspaceId: "ws",
    title: id,
    agentType,
    sessionKind,
    parentSessionId: sessionKind === "main" ? null : "lead",
    status: "idle",
    writeMode: "native-write",
    createdAt: "2026-10-12T00:00:00.000Z",
    updatedAt: "2026-10-12T00:00:00.000Z",
    lastMessageAt: null,
  } as SessionRecord;
}

function run(id: string, sessionId: string): RunRecord {
  return {
    id,
    sessionId,
    triggerMessageId: `m-${id}`,
    status: "completed",
    error: null,
    startedAt: "2026-10-12T00:00:00.000Z",
    endedAt: "2026-10-12T00:01:00.000Z",
  };
}

function setup(limits: Partial<AgentRunLimits> = {}) {
  const sessions = new Map<string, SessionRecord>();
  const active = new Map<string, AgentId>();
  const dispatched: string[] = [];
  const expired: Array<[string, string, string]> = [];
  const work: Promise<unknown>[] = [];
  const capacity = new RunCapacity({
    readLimits: async () => ({
      maxConcurrentRuns: 2,
      maxConcurrentRunsPerAgent: 1,
      delegatedRunTimeoutMinutes: 5,
      ...limits,
    }),
    activeAgentTypes: async () => [...active.values()],
    getSession: async (id) => sessions.get(id) ?? null,
    hasActiveRun: (id) => active.has(id),
    dispatchQueued: async (id) => {
      dispatched.push(id);
      const agentType = sessions.get(id)?.agentType;
      if (agentType) active.set(id, agentType);
    },
    expireRun: async (sessionId, runId, reason) => {
      expired.push([sessionId, runId, reason]);
    },
    track: (promise) => work.push(promise),
    onError: (error) => {
      throw error;
    },
  });
  const add = (record: SessionRecord) => sessions.set(record.id, record);
  const end = async (sessionId: string, runId = `run-${sessionId}`) => {
    active.delete(sessionId);
    capacity.onRunEnded(run(runId, sessionId));
    await Promise.all(work);
  };
  return { capacity, active, add, end, dispatched, expired };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("RunCapacity", () => {
  it("never holds a session the user drives", async () => {
    const { capacity, active } = setup({ maxConcurrentRuns: 1 });
    active.set("busy", "codex");

    await expect(
      capacity.mustWait(session("mine", "codex", "main")),
    ).resolves.toBe(false);
  });

  it("holds delegated runs past a limit and starts them in arrival order as slots free", async () => {
    const { capacity, active, add, end, dispatched } = setup({
      maxConcurrentRunsPerAgent: 2,
    });
    active.set("lead", "claude-agent");
    active.set("a", "codex");
    for (const id of ["b", "c"]) {
      const record = session(id, "codex");
      add(record);
      expect(await capacity.mustWait(record)).toBe(true);
      capacity.hold(id);
    }
    const bStarted = capacity.whenAdmitted("b");

    await end("a");

    await expect(bStarted).resolves.toBeUndefined();
    expect(dispatched).toEqual(["b"]);
    expect(capacity.isHeld("c")).toBe(true);
  });

  it("does not let one agent's backlog block another agent", async () => {
    const { capacity, active, add, end, dispatched } = setup({
      maxConcurrentRuns: 3,
    });
    active.set("codex-1", "codex");
    active.set("claude-1", "claude-agent");
    add(session("codex-2", "codex"));
    add(session("claude-2", "claude-agent"));
    capacity.hold("codex-2");
    capacity.hold("claude-2");

    await end("claude-1");

    expect(dispatched).toEqual(["claude-2"]);
    expect(capacity.isHeld("codex-2")).toBe(true);
  });

  it("drops a held session that was stopped", async () => {
    const { capacity } = setup();
    capacity.hold("a");
    const waiting = capacity.whenAdmitted("a");

    capacity.release("a", new Error("stopped"));

    await expect(waiting).rejects.toThrow("stopped");
    expect(capacity.isHeld("a")).toBe(false);
  });

  it("fails a delegated run that outlives its deadline", async () => {
    vi.useFakeTimers();
    const { capacity, expired } = setup({ delegatedRunTimeoutMinutes: 5 });

    await capacity.armDeadline(session("a", "codex"), "run-a");
    await capacity.armDeadline(session("u", "codex", "main"), "run-u");
    await vi.advanceTimersByTimeAsync(5 * 60_000);

    expect(expired).toEqual([["a", "run-a", "Run timed out after 5 minutes"]]);
  });

  it("disarms the deadline of a run that already ended", async () => {
    vi.useFakeTimers();
    const { capacity, end, expired } = setup();

    await capacity.armDeadline(session("a", "codex"), "run-a");
    await end("a", "run-a");
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(expired).toEqual([]);
  });

  it("leaves delegated runs unbounded when the timeout is off", async () => {
    vi.useFakeTimers();
    const { capacity, expired } = setup({ delegatedRunTimeoutMinutes: null });

    await capacity.armDeadline(session("a", "codex"), "run-a");
    await vi.advanceTimersByTimeAsync(24 * 60 * 60_000);

    expect(expired).toEqual([]);
  });
});
