import type {
  AgentEvent,
  AppResyncSnapshot,
  DaemonEventMeta,
} from "@cocurdex/shared";
import { createStore } from "jotai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messagesBySessionAtom } from "@/features/agent/view/message-store";
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
