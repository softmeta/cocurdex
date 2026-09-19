import type {
  AgentEvent,
  AppResyncSnapshot,
  DaemonEventMeta,
} from "@cocurdex/shared";
import { act, cleanup, renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messagesBySessionAtom } from "@/features/agent/view/message-store";
import { useAgentEventBridge } from "./app-shell-events";

const host = vi.hoisted(() => ({
  listener: null as
    | ((event: AgentEvent, meta?: DaemonEventMeta) => void)
    | null,
  resyncApp: vi.fn<(ids: string[]) => Promise<AppResyncSnapshot>>(),
  onDataChanged: vi.fn(() => () => {}),
}));
vi.mock("@/lib/ipc", () => ({ desktopApi: host }));
vi.mock("@/lib/task-client", () => ({
  taskApi: {
    onAgentEvent: (listener: typeof host.listener) => {
      host.listener = listener;
      return () => {
        host.listener = null;
      };
    },
  },
}));

afterEach(() => {
  cleanup();
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
    const { result } = renderHook(() => useAgentEventBridge(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      ),
    });
    let synchronization: Promise<void> = Promise.resolve();
    act(() => {
      synchronization = result.current(["session"]);
    });
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
    act(() => {
      delta("already covered", 10);
      delta(" world", 11);
    });
    expect(store.get(messagesBySessionAtom).session).toBeUndefined();
    await act(async () => {
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
          },
        },
      });
      await synchronization;
      await vi.runOnlyPendingTimersAsync();
    });
    expect(store.get(messagesBySessionAtom).session[0].content).toBe(
      "Hello world",
    );
  });
});
