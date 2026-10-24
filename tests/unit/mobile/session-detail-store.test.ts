import {
  createSessionDetailStore,
  DETAIL_RELOAD_DELAY_MS,
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
