import {
  createSessionDetailStore,
  DETAIL_RELOAD_DELAY_MS,
  DETAIL_STREAM_BATCH_MS,
} from "@cocurdex/mobile/internal/session-detail/session-detail-store";
import type {
  AgentToolCallRecord,
  MessageRecord,
  SessionObservationSnapshot,
  SessionRecord,
} from "@cocurdex/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeConnection } from "./fake-connection";

const SESSION: SessionRecord = {
  id: "s1",
  workspaceId: "w1",
  title: "Add discount codes",
  agentType: "claude-agent",
  status: "running",
  writeMode: "native-write",
  sessionModeId: null,
  createdAt: "2026-10-24T10:00:00.000Z",
  updatedAt: "2026-10-24T10:00:00.000Z",
  lastMessageAt: null,
};

const OBSERVATION: SessionObservationSnapshot = {
  session: SESSION,
  messages: [],
  activeMessages: [],
  toolCalls: [],
  queuedAgentInputs: [],
  activeRun: null,
  usage: null,
  turnChangeSets: {},
  interactions: { permissions: [], questions: [], planApprovals: [] },
  plan: null,
};

const TOOL: AgentToolCallRecord = {
  id: "t1",
  sessionId: "s1",
  title: "Read src/cart.ts",
  status: "in_progress",
  content: [],
  locations: [],
  startedAt: "2026-10-24T10:00:01.000Z",
  updatedAt: "2026-10-24T10:00:01.000Z",
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

async function loadedStore(results: Record<string, unknown[]>) {
  const fake = fakeConnection(results);
  const store = createSessionDetailStore(fake.connection, "s1");
  store.subscribe(() => {});
  await vi.runAllTimersAsync();
  return { fake, store };
}

describe("createSessionDetailStore", () => {
  it("shows the last seen transcript at once and replaces it when the reload lands", async () => {
    const renamed = {
      ...OBSERVATION,
      session: { ...SESSION, title: "Renamed" },
    };
    const fake = fakeConnection({ "session.snapshot": [renamed] });
    const store = createSessionDetailStore(fake.connection, "s1", OBSERVATION);
    store.subscribe(() => {});

    expect(store.getSnapshot()).toMatchObject({
      loaded: true,
      observation: OBSERVATION,
    });
    await vi.runAllTimersAsync();
    expect(store.getSnapshot().observation?.session.title).toBe("Renamed");
  });

  it("streams deltas into one message and settles it on completion", async () => {
    const { fake, store } = await loadedStore({
      "session.snapshot": [OBSERVATION],
    });

    for (const delta of ["Reading ", "the cart"]) {
      fake.emit({
        type: "message.delta",
        sessionId: "s1",
        messageId: "a1",
        role: "assistant",
        delta,
        createdAt: "2026-10-24T10:00:02.000Z",
      });
    }
    await vi.advanceTimersByTimeAsync(DETAIL_STREAM_BATCH_MS);
    expect(store.getSnapshot().observation?.activeMessages).toMatchObject([
      { id: "a1", content: "Reading the cart" },
    ]);

    const completed: MessageRecord = {
      id: "a1",
      sessionId: "s1",
      role: "assistant",
      content: "Reading the cart module.",
      attachments: [],
      createdAt: "2026-10-24T10:00:02.000Z",
    };
    fake.emit({
      type: "message.completed",
      sessionId: "s1",
      message: completed,
    });

    expect(store.getSnapshot().observation).toMatchObject({
      messages: [completed],
      activeMessages: [],
    });
  });

  it("coalesces small deltas without delaying message completion", async () => {
    const { fake, store } = await loadedStore({
      "session.snapshot": [OBSERVATION],
    });
    const changed = vi.fn();
    store.subscribe(changed);
    for (const delta of ["中", "文", " content"]) {
      fake.emit({
        type: "message.delta",
        sessionId: "s1",
        messageId: "a1",
        role: "assistant",
        delta,
        createdAt: "2026-10-24T10:00:02.000Z",
      });
    }
    expect(changed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(DETAIL_STREAM_BATCH_MS);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().observation?.activeMessages[0]?.content).toBe(
      "中文 content",
    );
    fake.emit({
      type: "message.delta",
      sessionId: "s1",
      messageId: "a1",
      role: "assistant",
      delta: " tail",
      createdAt: "2026-10-24T10:00:02.000Z",
    });
    fake.emit({
      type: "message.completed",
      sessionId: "s1",
      message: {
        id: "a1",
        sessionId: "s1",
        role: "assistant",
        content: "中文 content tail",
        attachments: [],
        createdAt: "2026-10-24T10:00:02.000Z",
      },
    });
    expect(store.getSnapshot().observation?.messages[0]?.content).toBe(
      "中文 content tail",
    );
    expect(store.getSnapshot().observation?.activeMessages).toEqual([]);
    changed.mockClear();
    await vi.advanceTimersByTimeAsync(DETAIL_STREAM_BATCH_MS);
    expect(changed).not.toHaveBeenCalled();
  });

  it("upserts tool calls and ignores other sessions", async () => {
    const { fake, store } = await loadedStore({
      "session.snapshot": [OBSERVATION],
    });

    fake.emit({ type: "tool.started", sessionId: "s1", toolCall: TOOL });
    fake.emit({
      type: "tool.finished",
      sessionId: "s1",
      toolCall: { ...TOOL, status: "completed" },
    });
    fake.emit({
      type: "tool.started",
      sessionId: "other",
      toolCall: { ...TOOL, id: "t2", sessionId: "other" },
    });

    expect(store.getSnapshot().observation?.toolCalls).toEqual([
      { ...TOOL, status: "completed" },
    ]);
  });

  it("keeps deltas current while batching notifications and cancels them on unsubscribe", async () => {
    const fake = fakeConnection({ "session.snapshot": [OBSERVATION] });
    const store = createSessionDetailStore(fake.connection, "s1");
    const changed = vi.fn();
    const unsubscribe = store.subscribe(changed);
    await vi.runAllTimersAsync();
    changed.mockClear();
    fake.emit({
      type: "message.delta",
      sessionId: "s1",
      messageId: "a1",
      role: "assistant",
      delta: "Received immediately",
      createdAt: "2026-10-24T10:00:02.000Z",
    });
    expect(store.getSnapshot().observation?.activeMessages[0]?.content).toBe(
      "Received immediately",
    );
    expect(changed).not.toHaveBeenCalled();
    unsubscribe();
    await vi.advanceTimersByTimeAsync(DETAIL_STREAM_BATCH_MS);
    expect(changed).not.toHaveBeenCalled();
    expect(store.observed()).toBe(false);
  });

  it("refetches the snapshot once for a burst of interaction events", async () => {
    const { fake } = await loadedStore({
      "session.snapshot": [OBSERVATION],
    });

    fake.emit({ type: "permission.requested", sessionId: "s1" } as never);
    fake.emit({ type: "state.changed", sessionId: "s1" } as never);
    await vi.advanceTimersByTimeAsync(DETAIL_RELOAD_DELAY_MS);

    expect(calls(fake.request, "session.snapshot")).toBe(2);
  });

  it("marks a session the host no longer has as missing", async () => {
    const { store } = await loadedStore({ "session.snapshot": [null] });

    expect(store.getSnapshot()).toMatchObject({
      loaded: true,
      missing: true,
      observation: null,
    });
  });
});
