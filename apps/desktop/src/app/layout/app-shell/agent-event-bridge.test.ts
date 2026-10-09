import type {
  AgentEvent,
  AppResyncSnapshot,
  DaemonEventMeta,
  SessionRecord,
} from "@cocurdex/shared";
import { createStore } from "jotai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messagesBySessionAtom } from "@/features/agent/view/message-store";
import {
  deleteSessionAtom,
  selectSessionAtom,
  sessionResultAttentionAtom,
  sessionsAtom,
} from "@/features/sessions";
import {
  createAgentEventBridge,
  startAgentEventBridge,
} from "./agent-event-bridge";

const host = vi.hoisted(() => ({
  listener: null as
    | ((event: AgentEvent, meta?: DaemonEventMeta) => void)
    | null,
  resyncApp: vi.fn<(ids: string[]) => Promise<AppResyncSnapshot>>(),
  onDataChanged: vi.fn(() => () => {}),
  listSessionAttention: vi.fn(async () => []),
  updateSessionAttention: vi.fn(async (_payload: unknown) => ({})),
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
    let resolveSnapshot: (snapshot: AppResyncSnapshot) => void = () => {};
    host.resyncApp.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSnapshot = resolve;
        }),
    );
    const store = createStore();
    const bridge = createAgentEventBridge(store);
    const stop = bridge.start();
    const synchronization = bridge.synchronize(["session"]);
    expect(host.resyncApp).toHaveBeenCalledWith(["session"]);
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
      epoch: "epoch",
      eventSeq: 10,
      sessions: [],
      queuedAgentInputs: [],
      queuedMessages: [],
      sessionUsage: {},
      interactions: { permissions: [], questions: [], planApprovals: [] },
      transcripts: {
        session: {
          messages: [],
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
