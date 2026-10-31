import {
  type AgentEvent,
  type AgentSessionRuntimeState,
  type DaemonEventMeta,
  EMPTY_AGENT_SESSION_RUNTIME_STATE,
  type SessionRecord,
  type SyncPullInput,
  type SyncPullResult,
} from "@cocurdex/shared";
import { createStore } from "jotai";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAgentEventBridge,
  startAgentEventBridge,
} from "@/app/layout/app-shell/agent-event-bridge";
import { agentRuntimeBySessionAtom } from "@/features/agent/runtime";
import { messagesBySessionAtom } from "@/features/agent/view/message-store";
import {
  deleteSessionAtom,
  selectSessionAtom,
  sessionResultAttentionAtom,
  sessionsAtom,
} from "@/features/sessions";

const host = vi.hoisted(() => ({
  listener: null as
    | ((event: AgentEvent, meta?: DaemonEventMeta) => void)
    | null,
  pullSync: vi.fn<(input: SyncPullInput) => Promise<SyncPullResult>>(),
  onDataChanged: vi.fn(() => () => {}),
  listSessionAttention: vi.fn(async () => []),
  updateSessionAttention: vi.fn(async (_payload: unknown) => ({})),
  getSessionRuntimeState: vi.fn<
    (sessionId: string) => Promise<AgentSessionRuntimeState>
  >(async () => EMPTY_AGENT_SESSION_RUNTIME_STATE),
  activeListeners: 0,
}));
vi.mock("@/lib/ipc", () => ({ desktopApi: host }));
vi.mock("@/lib/task-client", () => ({
  taskApi: {
    onAgentEvent: (listener: typeof host.listener) => {
      host.listener = listener;
      host.activeListeners += 1;
      return () => {
        host.activeListeners -= 1;
        host.listener = null;
      };
    },
  },
}));

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("agent state during a window handoff", () => {
  it("waits for the snapshot and replays only events newer than its boundary", async () => {
    vi.useFakeTimers();
    let resolveSnapshot: (snapshot: SyncPullResult) => void = () => {};
    host.pullSync.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSnapshot = resolve;
        }),
    );
    const store = createStore();
    const bridge = createAgentEventBridge(store);
    const stop = bridge.start();
    const synchronization = bridge.synchronize(["session"]);
    expect(host.pullSync).toHaveBeenCalledWith({
      sessionIds: ["session"],
      hydratedSessionIds: [],
      cursor: null,
    });
    const delta = (content: string, seq: number) =>
      host.listener?.(
        {
          type: "message.delta",
          sessionId: "session",
          messageId: "answer",
          role: "assistant",
          delta: content,
          createdAt: "2026-09-18T00:00:00Z",
        },
        { epoch: "epoch", seq },
      );
    delta("already covered", 10);
    delta(" world", 11);
    expect(store.get(messagesBySessionAtom).session).toBeUndefined();
    resolveSnapshot({
      ...emptyPull("full"),
      eventSeq: 10,
      transcripts: {
        session: {
          complete: true,
          messages: [],
          deletedMessageIds: [],
          activeMessages: [
            {
              id: "answer",
              sessionId: "session",
              role: "assistant",
              content: "Hello",
              attachments: [],
              createdAt: "2026-09-18T00:00:00Z",
            },
          ],
          turnStats: {},
          turnChangeSets: {},
          toolCalls: [],
          plan: null,
        },
      },
    });
    await synchronization;
    await vi.runOnlyPendingTimersAsync();
    expect(store.get(messagesBySessionAtom).session[0].content).toBe(
      "Hello world",
    );
    stop();
  });
});

describe("incremental agent sync", () => {
  it("pulls only changes since the adopted cursor for loaded sessions", async () => {
    const store = createStore();
    store.set(sessionsAtom, [
      sessionRecord("kept", "2026-09-18T00:00:00Z"),
      sessionRecord("removed", "2026-09-18T00:00:00Z"),
    ]);
    const bridge = createAgentEventBridge(store);
    host.pullSync.mockResolvedValueOnce({
      ...emptyPull("full"),
      cursor: "cursor-1",
      sessions: [
        sessionRecord("kept", "2026-09-18T00:00:00Z"),
        sessionRecord("removed", "2026-09-18T00:00:00Z"),
      ],
      transcripts: {
        kept: transcript(true, [message("first", "First")]),
      },
    });
    await bridge.synchronize(["kept"]);

    host.pullSync.mockResolvedValueOnce({
      ...emptyPull("delta"),
      cursor: "cursor-2",
      removedSessionIds: ["removed"],
      transcripts: {
        kept: transcript(false, [message("second", "Second")]),
      },
    });
    await bridge.synchronize();

    expect(host.pullSync).toHaveBeenLastCalledWith({
      sessionIds: ["kept"],
      hydratedSessionIds: ["kept"],
      cursor: "cursor-1",
    });
    expect(store.get(sessionsAtom).map((session) => session.id)).toEqual([
      "kept",
    ]);
    expect(
      store.get(messagesBySessionAtom).kept.map((entry) => entry.content),
    ).toEqual(["First", "Second"]);
  });
});

function emptyPull(mode: SyncPullResult["mode"]): SyncPullResult {
  return {
    mode,
    cursor: "cursor",
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
  };
}

function message(id: string, content: string, seq = 0) {
  return {
    id,
    sessionId: "kept",
    role: "assistant" as const,
    content,
    attachments: [],
    createdAt: `2026-09-18T00:00:0${id === "first" ? 1 : 2}Z`,
    seq,
  };
}

function transcript(complete: boolean, messages: ReturnType<typeof message>[]) {
  return {
    complete,
    messages,
    deletedMessageIds: [],
    activeMessages: [],
    turnStats: {},
    turnChangeSets: null,
    toolCalls: [],
    plan: null,
  };
}

describe("agent event bridge lifetime", () => {
  it("keeps one agent event listener however often it is started", () => {
    startAgentEventBridge();
    startAgentEventBridge();
    expect(host.activeListeners).toBe(1);
  });
});

function resultAttention(latestResultAt: string) {
  return {
    lastVisitedAt: null,
    latestResultAt,
    resultDisposition: "automatic" as const,
  };
}

function sessionRecord(id: string, createdAt: string) {
  return {
    agentType: "codex",
    archivedAt: null,
    createdAt,
    id,
    lastMessageAt: null,
    status: "idle",
    title: id,
    updatedAt: createdAt,
    workspaceId: "workspace",
  } as SessionRecord;
}

describe("session visit sync", () => {
  it("marks only sessions that still exist when the active one is deleted", () => {
    const store = createStore();
    store.set(sessionsAtom, [
      sessionRecord("removed", "2026-10-09T00:00:02.000Z"),
      sessionRecord("next", "2026-10-09T00:00:01.000Z"),
    ]);
    store.set(sessionResultAttentionAtom, {
      removed: resultAttention("2026-10-09T00:00:03.000Z"),
      next: resultAttention("2026-10-09T00:00:03.000Z"),
    });
    store.set(selectSessionAtom, "removed");
    const stop = createAgentEventBridge(store).start();

    store.set(deleteSessionAtom, { sessionId: "removed" });
    stop();

    expect(
      host.updateSessionAttention.mock.calls.map(([payload]) => payload),
    ).toEqual([
      expect.objectContaining({ action: "visited", sessionId: "next" }),
    ]);
  });

  it("does not mark sessions without a result as visited", () => {
    const store = createStore();
    store.set(sessionsAtom, [
      sessionRecord("draft", "2026-10-09T00:00:02.000Z"),
      sessionRecord("done", "2026-10-09T00:00:01.000Z"),
    ]);
    store.set(sessionResultAttentionAtom, {
      done: resultAttention("2026-10-09T00:00:03.000Z"),
    });
    store.set(selectSessionAtom, "done");
    const stop = createAgentEventBridge(store).start();

    store.set(selectSessionAtom, "draft");
    stop();

    expect(
      host.updateSessionAttention.mock.calls.map(([payload]) => payload),
    ).toEqual([
      expect.objectContaining({ action: "visited", sessionId: "done" }),
    ]);
  });
});

describe("runtime state seeding", () => {
  it("loads the opened session's runtime state and keeps what the agent reported meanwhile", async () => {
    let resolveState: (state: AgentSessionRuntimeState) => void = () => {};
    host.getSessionRuntimeState.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveState = resolve;
        }),
    );
    const store = createStore();
    store.set(sessionsAtom, [
      sessionRecord("open", "2026-10-27T00:00:00.000Z"),
    ]);
    const stop = createAgentEventBridge(store).start();
    store.set(selectSessionAtom, "open");

    host.listener?.({
      type: "session.mode.updated",
      sessionId: "open",
      currentModeId: "plan",
    });
    resolveState({
      ...EMPTY_AGENT_SESSION_RUNTIME_STATE,
      configOptions: [
        { id: "fast", name: "Fast", type: "boolean", currentValue: true },
      ],
      mode: { availableModes: [], currentModeId: "default" },
    });
    await vi.waitFor(() =>
      expect(store.get(agentRuntimeBySessionAtom).open?.configOptions).toEqual([
        { id: "fast", name: "Fast", type: "boolean", currentValue: true },
      ]),
    );
    stop();

    expect(host.getSessionRuntimeState).toHaveBeenCalledTimes(1);
    expect(host.getSessionRuntimeState).toHaveBeenCalledWith("open");
    expect(store.get(agentRuntimeBySessionAtom).open?.mode?.currentModeId).toBe(
      "plan",
    );
  });

  it("leaves a session without reported runtime state unset", async () => {
    host.getSessionRuntimeState.mockResolvedValue(
      EMPTY_AGENT_SESSION_RUNTIME_STATE,
    );
    const store = createStore();
    store.set(sessionsAtom, [
      sessionRecord("idle", "2026-10-27T00:00:00.000Z"),
    ]);
    const stop = createAgentEventBridge(store).start();
    store.set(selectSessionAtom, "idle");
    await vi.waitFor(() =>
      expect(host.getSessionRuntimeState).toHaveBeenCalledWith("idle"),
    );
    await Promise.resolve();
    stop();

    expect(store.get(agentRuntimeBySessionAtom).idle).toBeUndefined();
  });
});
