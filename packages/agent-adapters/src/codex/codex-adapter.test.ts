import { type AgentEvent, CODEX_DEFAULT_MODEL_ID } from "@cocurdex/shared";
import { describe, expect, it, vi } from "vitest";
import { createCodexAdapter } from "./codex-adapter";

interface FakeLeaseOptions {
  // sendMessage only resolves once Codex reports turn/completed, so tests that
  // drive a full turn need the notification; tests that inspect an in-flight
  // turn (steer, stop) keep it running instead.
  autoCompleteTurns?: boolean;
}

// biome-ignore lint/suspicious/noExplicitAny: test double mirrors a loose client
type FakeClient = { startTurn?: (...args: any[]) => Promise<any> } & Record<
  string,
  unknown
>;

function createFakeLease(
  client: FakeClient,
  { autoCompleteTurns = true }: FakeLeaseOptions = {},
) {
  let notify:
    | ((notification: { method: string; params?: unknown }) => void)
    | null = null;
  client.setThreadName ??= vi.fn(async () => undefined);
  client.unsubscribeThread ??= vi.fn(async () => undefined);

  if (autoCompleteTurns && client.startTurn) {
    const startTurn = client.startTurn;
    client.startTurn = vi.fn(async (...args: unknown[]) => {
      const result = await startTurn(...args);
      queueMicrotask(() =>
        notify?.({
          method: "turn/completed",
          params: { turn: { id: result?.turn?.id, status: "completed" } },
        }),
      );
      return result;
    });
  }

  const lease = {
    client,
    subscribeThread: vi.fn(
      (
        _threadId: string,
        handlers: {
          onNotification(notification: {
            method: string;
            params?: unknown;
          }): void;
        },
      ) => {
        notify = handlers.onNotification;
      },
    ),
    unsubscribeThread: vi.fn(),
    onGlobalNotification: vi.fn(),
    release: vi.fn(),
  } as never;

  return {
    lease,
    completeTurn(turnId: string) {
      notify?.({
        method: "turn/completed",
        params: { turn: { id: turnId, status: "completed" } },
      });
    },
    notify(notification: { method: string; params?: unknown }) {
      notify?.(notification);
    },
  };
}

describe("createCodexAdapter", () => {
  it("ignores app-managed provider configuration", async () => {
    const client = {
      startThread: vi.fn(async () => ({
        thread: { id: "thread-native-auth" },
      })),
      startTurn: vi.fn(async () => ({
        turn: { id: "turn-native-auth", status: "inProgress" },
      })),
    };
    const { lease } = createFakeLease(client);
    const acquireClient = vi.fn(() => lease);
    const session = createCodexAdapter({ acquireClient }).createSession(
      {
        session: {
          id: "session-native-auth",
          workspaceId: "workspace-1",
          title: "Native Codex auth",
          agentType: "codex",
          status: "idle",
          writeMode: "read-only",
          collaborationMode: "default",
          createdAt: "2026-08-19T00:00:00.000Z",
          updatedAt: "2026-08-19T00:00:00.000Z",
          lastMessageAt: null,
          archivedAt: null,
          providerSnapshot: null,
        },
        workspaceRootPath: "/tmp/repo",
        providerConfig: {
          providerId: "custom-openai",
          providerName: "Custom OpenAI",
          modelId: "custom-model",
          modelName: "Custom model",
          api: "openai-responses",
          baseUrl: "https://example.invalid/v1",
          apiKey: "custom-secret",
        },
      },
      () => {},
    );

    await session.sendMessage({ content: "Start", history: [] });

    expect(acquireClient).toHaveBeenCalledWith();
    expect(client.startThread).toHaveBeenCalledWith(
      expect.objectContaining({ model: CODEX_DEFAULT_MODEL_ID }),
    );
    session.dispose();
  });

  it("persists Cocurdex titles in the native Codex thread", async () => {
    const client = {
      startThread: vi.fn(async () => ({ thread: { id: "thread-title" } })),
      startTurn: vi.fn(async () => ({
        turn: { id: "turn-title", status: "inProgress" },
      })),
      setThreadName: vi.fn(async () => undefined),
    };
    const { lease } = createFakeLease(client, {
      autoCompleteTurns: false,
    });
    const session = createCodexAdapter({
      acquireClient: () => lease,
    }).createSession(
      {
        session: {
          id: "session-title",
          workspaceId: "workspace-1",
          title: "Local Codex title",
          agentType: "codex",
          status: "idle",
          writeMode: "read-only",
          collaborationMode: "default",
          createdAt: "2026-08-15T00:00:00.000Z",
          updatedAt: "2026-08-15T00:00:00.000Z",
          lastMessageAt: null,
          archivedAt: null,
          providerSnapshot: null,
        },
        workspaceRootPath: "/tmp/repo",
      },
      () => {},
    );

    void session.sendMessage({ content: "Start", history: [] });
    await vi.waitFor(() => expect(client.startTurn).toHaveBeenCalledOnce());
    expect(client.setThreadName).toHaveBeenCalledWith(
      "thread-title",
      "Local Codex title",
    );

    await session.setTitle?.("Refined Cocurdex title");
    expect(client.setThreadName).toHaveBeenLastCalledWith(
      "thread-title",
      "Refined Cocurdex title",
    );
    session.dispose();
  });

  it("restores the Cocurdex title when resuming a differently named thread", async () => {
    const client = {
      resumeThread: vi.fn(async () => ({
        thread: { id: "thread-resume-title", name: "Stale native title" },
      })),
      startTurn: vi.fn(async () => ({
        turn: { id: "turn-resume-title", status: "inProgress" },
      })),
      setThreadName: vi.fn(async () => undefined),
    };
    const { lease } = createFakeLease(client);
    const session = createCodexAdapter({
      acquireClient: () => lease,
    }).createSession(
      {
        session: {
          id: "session-resume-title",
          workspaceId: "workspace-1",
          title: "Current Cocurdex title",
          agentType: "codex",
          status: "idle",
          writeMode: "read-only",
          collaborationMode: "default",
          createdAt: "2026-08-15T00:00:00.000Z",
          updatedAt: "2026-08-15T00:00:00.000Z",
          lastMessageAt: null,
          archivedAt: null,
          providerSnapshot: null,
        },
        workspaceRootPath: "/tmp/repo",
        providerSession: {
          sessionId: "session-resume-title",
          providerSessionId: "thread-resume-title",
          providerStateJson: "{}",
          providerVersion: null,
          resumable: true,
          updatedAt: "2026-08-15T00:00:00.000Z",
        },
      },
      () => {},
    );

    await session.sendMessage({ content: "Continue", history: [] });

    expect(client.setThreadName).toHaveBeenCalledOnce();
    expect(client.setThreadName).toHaveBeenCalledWith(
      "thread-resume-title",
      "Current Cocurdex title",
    );
    session.dispose();
  });

  it("applies a changed permission mode on the next turn without replacing the thread", async () => {
    const client = {
      startThread: vi.fn(async () => ({
        thread: { id: "thread-permissions" },
      })),
      startTurn: vi.fn(
        async (request: {
          approvalPolicy?: string;
          sandboxPolicy?: { type: string };
        }) => ({
          turn: {
            id: `${request.approvalPolicy}-${request.sandboxPolicy?.type}`,
            status: "inProgress",
          },
        }),
      ),
    };
    const { lease } = createFakeLease(client);
    const session = createCodexAdapter({
      acquireClient: () => lease,
    }).createSession(
      {
        session: {
          id: "session-permissions",
          workspaceId: "workspace-1",
          title: "Codex permissions",
          agentType: "codex",
          status: "idle",
          writeMode: "read-only",
          collaborationMode: "default",
          permissionMode: "codex-read-only",
          createdAt: "2026-08-03T00:00:00.000Z",
          updatedAt: "2026-08-03T00:00:00.000Z",
          lastMessageAt: null,
          archivedAt: null,
          providerSnapshot: null,
        },
        workspaceRootPath: "/tmp/repo",
      },
      () => {},
    );

    await session.sendMessage({
      content: "Start",
      history: [],
      permissionMode: "codex-read-only",
    });
    await session.sendMessage({
      content: "Continue with access",
      history: [],
      permissionMode: "codex-full-access",
    });

    expect(client.startThread).toHaveBeenCalledOnce();
    expect(client.startTurn).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        approvalPolicy: "never",
        sandboxPolicy: expect.objectContaining({ type: "dangerFullAccess" }),
      }),
    );
  });

  it("maps steer delivery to turn/steer on the active Codex turn", async () => {
    const client = {
      startThread: vi.fn(async () => ({ thread: { id: "thread-1" } })),
      startTurn: vi.fn(async () => ({
        turn: { id: "turn-1", status: "inProgress" },
      })),
      steerTurn: vi.fn(async () => undefined),
    };
    const { lease } = createFakeLease(client, { autoCompleteTurns: false });
    const adapter = createCodexAdapter({
      acquireClient: () => lease,
    });
    const session = adapter.createSession(
      {
        session: {
          id: "session-1",
          workspaceId: "workspace-1",
          title: "Codex session",
          agentType: "codex",
          status: "idle",
          writeMode: "read-only",
          collaborationMode: "default",
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
          lastMessageAt: null,
          archivedAt: null,
          providerSnapshot: null,
        },
        workspaceRootPath: "/tmp/repo",
      },
      () => {},
    );

    // Not awaited: the turn stays in flight, which is what steering targets.
    void session.sendMessage({ content: "Start", history: [] });
    await vi.waitFor(() => expect(client.startTurn).toHaveBeenCalledOnce());
    await session.sendMessage({
      content: "Check the failing test first",
      history: [],
      delivery: "steer-active-run",
    });

    expect(client.startTurn).toHaveBeenCalledOnce();
    expect(client.steerTurn).toHaveBeenCalledWith({
      threadId: "thread-1",
      expectedTurnId: "turn-1",
      clientUserMessageId: expect.any(String),
      input: [{ type: "text", text: "Check the failing test first" }],
    });
  });

  it("fails without starting a replacement thread when resume fails", async () => {
    const client = {
      resumeThread: vi.fn(async () => {
        throw new Error("thread not found");
      }),
      startThread: vi.fn(async () => ({ thread: { id: "replacement" } })),
      startTurn: vi.fn(),
    };
    const { lease } = createFakeLease(client);
    const events: AgentEvent[] = [];
    const adapter = createCodexAdapter({
      acquireClient: () => lease,
    });
    const session = adapter.createSession(
      {
        session: {
          id: "session-recovery",
          workspaceId: "workspace-1",
          title: "Codex recovery",
          agentType: "codex",
          status: "idle",
          writeMode: "read-only",
          collaborationMode: "default",
          createdAt: "2026-08-03T00:00:00.000Z",
          updatedAt: "2026-08-03T00:00:00.000Z",
          lastMessageAt: null,
          archivedAt: null,
          providerSnapshot: null,
        },
        workspaceRootPath: "/tmp/repo",
        providerSession: {
          sessionId: "session-recovery",
          providerSessionId: "missing-thread",
          providerStateJson: "{}",
          providerVersion: null,
          resumable: true,
          updatedAt: "2026-08-03T00:00:00.000Z",
        },
      },
      (event) => events.push(event),
    );

    await session.sendMessage({
      content: "Continue",
      history: [
        {
          id: "user-old",
          sessionId: "session-recovery",
          role: "user",
          content: "Start",
          attachments: [],
          createdAt: "2026-08-03T00:00:00.000Z",
        },
        {
          id: "assistant-old",
          sessionId: "session-recovery",
          role: "assistant",
          content: "Done",
          attachments: [],
          createdAt: "2026-08-03T00:00:01.000Z",
        },
      ],
    });

    expect(client.startThread).not.toHaveBeenCalled();
    expect(client.startTurn).not.toHaveBeenCalled();
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "error",
        message: expect.stringContaining(
          "could not restore its native session",
        ),
      }),
    );
  });

  it("waits for the Codex interrupt request before stop resolves", async () => {
    let releaseInterrupt!: () => void;
    const interruptTurn = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseInterrupt = resolve;
        }),
    );
    const client = {
      startThread: vi.fn(async () => ({ thread: { id: "thread-stop" } })),
      startTurn: vi.fn(async () => ({
        turn: { id: "turn-stop", status: "inProgress" },
      })),
      interruptTurn,
    };
    const { lease } = createFakeLease(client, { autoCompleteTurns: false });
    const session = createCodexAdapter({
      acquireClient: () => lease,
    }).createSession(
      {
        session: {
          id: "session-stop",
          workspaceId: "workspace-1",
          title: "Codex stop",
          agentType: "codex",
          status: "idle",
          writeMode: "read-only",
          collaborationMode: "default",
          createdAt: "2026-08-03T00:00:00.000Z",
          updatedAt: "2026-08-03T00:00:00.000Z",
          lastMessageAt: null,
          archivedAt: null,
          providerSnapshot: null,
        },
        workspaceRootPath: "/tmp/repo",
      },
      () => {},
    );

    void session.sendMessage({ content: "Start", history: [] });
    await vi.waitFor(() => expect(client.startTurn).toHaveBeenCalledOnce());
    const stopping = Promise.resolve(session.stop());
    await vi.waitFor(() =>
      expect(interruptTurn).toHaveBeenCalledWith("thread-stop", "turn-stop"),
    );

    let resolved = false;
    void stopping.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);

    releaseInterrupt();
    await stopping;
    expect(resolved).toBe(true);
  });

  it("publishes the current Codex account rate limits", async () => {
    const client = {
      request: vi.fn(async () => ({
        rateLimits: {
          primary: { usedPercent: 30, windowDurationMins: 300 },
          secondary: { usedPercent: 45, windowDurationMins: 10_080 },
        },
      })),
      startThread: vi.fn(async () => ({ thread: { id: "thread-limits" } })),
      startTurn: vi.fn(async () => ({
        turn: { id: "turn-limits", status: "inProgress" },
      })),
    };
    const { lease } = createFakeLease(client);
    const events: AgentEvent[] = [];
    const session = createCodexAdapter({
      acquireClient: () => lease,
    }).createSession(
      {
        session: {
          id: "session-limits",
          workspaceId: "workspace-1",
          title: "Codex limits",
          agentType: "codex",
          status: "idle",
          writeMode: "read-only",
          collaborationMode: "default",
          createdAt: "2026-08-03T00:00:00.000Z",
          updatedAt: "2026-08-03T00:00:00.000Z",
          lastMessageAt: null,
          archivedAt: null,
          providerSnapshot: null,
        },
        workspaceRootPath: "/tmp/repo",
      },
      (event) => events.push(event),
    );

    await session.sendMessage({ content: "Start", history: [] });
    await vi.waitFor(() =>
      expect(events.some((event) => event.type === "rate_limits.updated")).toBe(
        true,
      ),
    );

    expect(client.request).toHaveBeenCalledWith("account/rateLimits/read");
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "rate_limits.updated",
        rateLimits: expect.objectContaining({
          windows: [
            expect.objectContaining({ kind: "five-hour", usedPercent: 30 }),
            expect.objectContaining({ kind: "weekly", usedPercent: 45 }),
          ],
        }),
      }),
    );
  });

  // The daemon treats a resolved sendMessage as "turn finished" and only then
  // dispatches the next queued follow-up, so resolving at turn/start would send
  // queued input into a still-running turn.
  it("keeps sendMessage pending until Codex reports turn/completed", async () => {
    const client = {
      startThread: vi.fn(async () => ({ thread: { id: "thread-pending" } })),
      startTurn: vi.fn(async () => ({
        turn: { id: "turn-pending", status: "inProgress" },
      })),
    };
    const { lease, completeTurn } = createFakeLease(client, {
      autoCompleteTurns: false,
    });
    const session = createCodexAdapter({
      acquireClient: () => lease,
    }).createSession(
      {
        session: {
          id: "session-pending",
          workspaceId: "workspace-1",
          title: "Codex pending",
          agentType: "codex",
          status: "idle",
          writeMode: "read-only",
          collaborationMode: "default",
          createdAt: "2026-08-03T00:00:00.000Z",
          updatedAt: "2026-08-03T00:00:00.000Z",
          lastMessageAt: null,
          archivedAt: null,
          providerSnapshot: null,
        },
        workspaceRootPath: "/tmp/repo",
      },
      () => {},
    );

    let settled = false;
    const sending = session.sendMessage({ content: "Start", history: [] });
    void sending.then(() => {
      settled = true;
    });

    await vi.waitFor(() => expect(client.startTurn).toHaveBeenCalledOnce());
    expect(settled).toBe(false);

    completeTurn("turn-pending");
    await sending;
    expect(settled).toBe(true);
  });
});
