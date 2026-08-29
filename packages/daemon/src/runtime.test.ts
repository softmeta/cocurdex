import type { AgentAdapter, AgentSession } from "@cocurdex/agent-core";
import type {
  AgentEvent,
  AgentProviderSessionRecord,
  AgentRuntimeProviderConfig,
  MessageRecord,
  SendSessionMessagePayload,
  SessionRecord,
} from "@cocurdex/shared";
import { describe, expect, it, vi } from "vitest";
import { AgentRuntimeManager, type RuntimePersistence } from "./runtime";

function createSessionRecord(): SessionRecord {
  return {
    id: "session-1",
    workspaceId: "workspace-1",
    parentSessionId: null,
    agentType: "grok-build",
    title: "Test",
    status: "idle",
    writeMode: "read-only",
    collaborationMode: "default",
    createdAt: "2026-07-24T00:00:00.000Z",
    lastMessageAt: null,
    updatedAt: "2026-07-24T00:00:00.000Z",
  };
}

function createPayload(): SendSessionMessagePayload {
  return {
    session: createSessionRecord(),
    workspaceRootPath: "/workspace",
    content: "hello",
  };
}

function createPersistence(
  providerConfig?: AgentRuntimeProviderConfig,
): RuntimePersistence {
  return {
    providerSession: null,
    onProviderSessionUpdate: vi.fn(),
    providerConfig,
  };
}

function createAdapter(session: AgentSession): AgentAdapter {
  return {
    getDescriptor() {
      throw new Error("Descriptor is not used by runtime tests");
    },
    createSession() {
      return session;
    },
  };
}

describe("AgentRuntimeManager", () => {
  it("generates a title through the owned session runtime", async () => {
    const generateTitle = vi.fn(async () => "Runtime title");
    const runtimeSession: AgentSession = {
      dispose: vi.fn(),
      generateTitle,
      sendMessage: vi.fn(),
      stop: vi.fn(),
    };
    const manager = new AgentRuntimeManager({
      broadcastAgentEvent: vi.fn(),
      createAdapter: () => createAdapter(runtimeSession),
    });
    const payload = createPayload();

    manager.createSessionRuntime(payload, createPersistence());

    await expect(
      manager.generateSessionTitle(payload.session.id, payload.content),
    ).resolves.toBe("Runtime title");
    expect(generateTitle).toHaveBeenCalledWith(payload.content);
  });

  it("publishes an event only after persistence completes", async () => {
    let releasePersistence: () => void = () => undefined;
    const persistence = new Promise<void>((resolve) => {
      releasePersistence = resolve;
    });
    const broadcastAgentEvent = vi.fn();
    const manager = new AgentRuntimeManager({
      broadcastAgentEvent,
      createAdapter: () =>
        createAdapter({
          dispose: vi.fn(),
          sendMessage: vi.fn(),
          stop: vi.fn(),
        }),
    });
    manager.configureAgentEventPersistence(() => persistence);
    const event: AgentEvent = {
      type: "state.changed",
      sessionId: "session-1",
      status: "running",
    };

    manager.emitAgentEvent(event);
    expect(broadcastAgentEvent).not.toHaveBeenCalled();

    releasePersistence();
    await vi.waitFor(() =>
      expect(broadcastAgentEvent).toHaveBeenCalledWith(event),
    );
  });

  it("forwards the current provider config to the adapter for each turn", async () => {
    const response: MessageRecord = {
      id: "assistant-1",
      sessionId: "session-1",
      role: "assistant",
      content: "done",
      attachments: [],
      createdAt: "2026-07-24T00:00:01.000Z",
    };
    const runtimeSession: AgentSession = {
      dispose: vi.fn(),
      sendMessage: vi.fn(async () => response),
      stop: vi.fn(),
    };
    const manager = new AgentRuntimeManager({
      broadcastAgentEvent: vi.fn(),
      createAdapter: () => createAdapter(runtimeSession),
    });
    const providerConfig: AgentRuntimeProviderConfig = {
      providerId: "openrouter",
      providerName: "OpenRouter",
      modelId: "anthropic/claude-sonnet-4.5",
      modelName: "Claude Sonnet 4.5",
      api: "openai-completions",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-test",
    };

    await manager.sendSessionMessage(createPayload(), {
      ...createPersistence(providerConfig),
      history: [],
    });

    expect(runtimeSession.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ providerConfig }),
    );
  });

  it("shuts down every owned runtime exactly once", async () => {
    const firstRuntime: AgentSession = {
      dispose: vi.fn(),
      sendMessage: vi.fn(),
      stop: vi.fn(),
    };
    const secondRuntime: AgentSession = {
      dispose: vi.fn(),
      sendMessage: vi.fn(),
      stop: vi.fn(),
    };
    const runtimes = [firstRuntime, secondRuntime];
    const manager = new AgentRuntimeManager({
      broadcastAgentEvent: vi.fn(),
      createAdapter: () => createAdapter(runtimes.shift() ?? firstRuntime),
    });
    const payload = createPayload();

    manager.createSessionRuntime(payload, createPersistence());
    manager.createSessionRuntime(
      {
        ...payload,
        session: { ...payload.session, id: "session-2" },
      },
      createPersistence(),
    );

    await manager.shutdown();
    await manager.shutdown();

    expect(firstRuntime.stop).toHaveBeenCalledOnce();
    expect(firstRuntime.dispose).toHaveBeenCalledOnce();
    expect(secondRuntime.stop).toHaveBeenCalledOnce();
    expect(secondRuntime.dispose).toHaveBeenCalledOnce();
  });

  it("continues shutting down when one runtime fails", async () => {
    const firstRuntime: AgentSession = {
      dispose: vi.fn(),
      sendMessage: vi.fn(),
      stop: vi.fn(() => {
        throw new Error("stop failed");
      }),
    };
    const secondRuntime: AgentSession = {
      dispose: vi.fn(),
      sendMessage: vi.fn(),
      stop: vi.fn(),
    };
    const runtimes = [firstRuntime, secondRuntime];
    const manager = new AgentRuntimeManager({
      broadcastAgentEvent: vi.fn(),
      createAdapter: () => createAdapter(runtimes.shift() ?? firstRuntime),
    });
    const payload = createPayload();

    manager.createSessionRuntime(payload, createPersistence());
    manager.createSessionRuntime(
      {
        ...payload,
        session: { ...payload.session, id: "session-2" },
      },
      createPersistence(),
    );

    await expect(manager.shutdown()).rejects.toThrow("stop failed");

    expect(firstRuntime.dispose).toHaveBeenCalledOnce();
    expect(secondRuntime.stop).toHaveBeenCalledOnce();
    expect(secondRuntime.dispose).toHaveBeenCalledOnce();
  });

  it("owns runtime mode and configuration updates", async () => {
    const setMode = vi.fn(async () => undefined);
    const setConfigOption = vi.fn(async () => []);
    const setTitle = vi.fn(async () => undefined);
    const runtimeSession: AgentSession = {
      dispose: vi.fn(),
      sendMessage: vi.fn(),
      setConfigOption,
      setMode,
      setTitle,
      stop: vi.fn(),
    };
    const manager = new AgentRuntimeManager({
      broadcastAgentEvent: vi.fn(),
      createAdapter: () => createAdapter(runtimeSession),
    });
    const payload = createPayload();

    manager.createSessionRuntime(payload, createPersistence());
    await manager.setSessionRuntimeMode(payload.session.id, "plan");
    await manager.setSessionRuntimeConfigOption(
      payload.session.id,
      "thinking",
      true,
    );
    await manager.setSessionTitle(payload.session.id, "Updated title");

    expect(setMode).toHaveBeenCalledWith("plan");
    expect(setConfigOption).toHaveBeenCalledWith("thinking", true);
    expect(setTitle).toHaveBeenCalledWith("Updated title");
  });

  it("rejects overlapping turns and emits aggregated turn stats", async () => {
    let resolveMessage: (message: MessageRecord) => void = () => undefined;
    const response: MessageRecord = {
      id: "assistant-1",
      sessionId: "session-1",
      role: "assistant",
      content: "done",
      attachments: [],
      createdAt: "2026-07-24T00:00:01.000Z",
    };
    const runtimeSession: AgentSession = {
      dispose: vi.fn(),
      sendMessage: vi.fn(
        () =>
          new Promise<MessageRecord>((resolve) => {
            resolveMessage = resolve;
          }),
      ),
      stop: vi.fn(),
    };
    const events: AgentEvent[] = [];
    const manager = new AgentRuntimeManager({
      broadcastAgentEvent: (event) => {
        events.push(event);
      },
      createAdapter: () => createAdapter(runtimeSession),
    });
    const payload = createPayload();
    const firstTurn = manager.sendSessionMessage(payload, {
      ...createPersistence(),
      history: [],
    });

    await expect(
      manager.sendSessionMessage(payload, {
        ...createPersistence(),
        history: [],
      }),
    ).rejects.toThrow("already has an active turn");

    manager.emitAgentEvent({
      attribution: "session-only",
      type: "usage.updated",
      sessionId: payload.session.id,
      usage: { inputTokens: 900, outputTokens: 0 },
      receivedAt: "2026-07-24T00:00:00.250Z",
    } as AgentEvent);
    manager.emitAgentEvent({
      type: "usage.updated",
      sessionId: payload.session.id,
      usage: { inputTokens: 4, outputTokens: 2 },
      receivedAt: "2026-07-24T00:00:00.500Z",
    });
    resolveMessage(response);
    await firstTurn;

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "turn.completed",
        messageId: response.id,
        usage: expect.objectContaining({ inputTokens: 4, outputTokens: 2 }),
      }),
    );
  });

  it("delivers steering input without replacing the active turn tracker", async () => {
    let resolveActiveTurn: (message: MessageRecord) => void = () => undefined;
    const activeResponse: MessageRecord = {
      id: "assistant-1",
      sessionId: "session-1",
      role: "assistant",
      content: "done",
      attachments: [],
      createdAt: "2026-07-24T00:00:01.000Z",
    };
    const steeredInput: MessageRecord = {
      ...activeResponse,
      id: "user-2",
      role: "user",
      content: "change direction",
    };
    const sendMessage = vi.fn((payload) => {
      if (payload.delivery === "steer-active-run") {
        return Promise.resolve(steeredInput);
      }
      return new Promise<MessageRecord>((resolve) => {
        resolveActiveTurn = resolve;
      });
    });
    const manager = new AgentRuntimeManager({
      broadcastAgentEvent: vi.fn(),
      createAdapter: () =>
        createAdapter({ dispose: vi.fn(), sendMessage, stop: vi.fn() }),
    });
    const payload = createPayload();

    const activeTurn = manager.sendSessionMessage(payload, {
      ...createPersistence(),
      history: [],
    });
    await manager.sendSessionMessage(
      { ...payload, content: "change direction", delivery: "steer-active-run" },
      { ...createPersistence(), history: [] },
    );
    resolveActiveTurn(activeResponse);
    await activeTurn;

    expect(sendMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ delivery: "steer-active-run" }),
    );
  });

  it("associates turn stats with the completed assistant message", async () => {
    const assistantMessage: MessageRecord = {
      id: "assistant-1",
      sessionId: "session-1",
      role: "assistant",
      content: "done",
      attachments: [],
      createdAt: "2026-07-24T00:00:01.000Z",
    };
    const returnedUserMessage: MessageRecord = {
      ...assistantMessage,
      id: "user-1",
      role: "user",
      content: "hello",
    };
    let emitFromRuntime: (event: AgentEvent) => void = () => undefined;
    const runtimeSession: AgentSession = {
      dispose: vi.fn(),
      sendMessage: vi.fn(async () => {
        emitFromRuntime({
          type: "message.completed",
          sessionId: assistantMessage.sessionId,
          message: assistantMessage,
        });
        emitFromRuntime({
          type: "usage.updated",
          sessionId: assistantMessage.sessionId,
          usage: { inputTokens: 4, outputTokens: 2 },
          receivedAt: assistantMessage.createdAt,
        });
        return returnedUserMessage;
      }),
      stop: vi.fn(),
    };
    const events: AgentEvent[] = [];
    const manager = new AgentRuntimeManager({
      broadcastAgentEvent: (event) => events.push(event),
      createAdapter: () => ({
        getDescriptor() {
          throw new Error("Descriptor is not used by runtime tests");
        },
        createSession(_payload, onEvent) {
          emitFromRuntime = onEvent;
          return runtimeSession;
        },
      }),
    });

    await manager.sendSessionMessage(createPayload(), {
      ...createPersistence(),
      history: [],
    });

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "turn.completed",
        messageId: assistantMessage.id,
        usage: expect.objectContaining({ inputTokens: 4, outputTokens: 2 }),
      }),
    );
  });

  it("invalidates a disposed runtime and suppresses its late events", async () => {
    let resolveMessage: (message: MessageRecord) => void = () => undefined;
    let emitFromRuntime: (event: AgentEvent) => void = () => undefined;
    let updateProviderSession: (
      providerSession: AgentProviderSessionRecord | null,
    ) => void = () => undefined;
    const response: MessageRecord = {
      id: "assistant-1",
      sessionId: "session-1",
      role: "assistant",
      content: "late response",
      attachments: [],
      createdAt: "2026-07-24T00:00:01.000Z",
    };
    const runtimeSession: AgentSession = {
      dispose: vi.fn(),
      sendMessage: vi.fn(
        () =>
          new Promise<MessageRecord>((resolve) => {
            resolveMessage = resolve;
          }),
      ),
      stop: vi.fn(),
    };
    const events: AgentEvent[] = [];
    const manager = new AgentRuntimeManager({
      broadcastAgentEvent: (event) => {
        events.push(event);
      },
      createAdapter: () => ({
        getDescriptor() {
          throw new Error("Descriptor is not used by runtime tests");
        },
        createSession(options, onEvent) {
          emitFromRuntime = onEvent;
          updateProviderSession =
            options.onProviderSessionUpdate ?? (() => undefined);
          return runtimeSession;
        },
      }),
    });
    const payload = createPayload();
    const persistence = createPersistence();
    const turn = manager.sendSessionMessage(payload, {
      ...persistence,
      history: [],
    });

    expect(await manager.disposeSessionRuntime(payload.session.id)).toBe(true);
    emitFromRuntime({
      type: "message.delta",
      sessionId: payload.session.id,
      messageId: response.id,
      role: "assistant",
      delta: "stale",
      createdAt: response.createdAt,
    });
    updateProviderSession({
      sessionId: payload.session.id,
      providerSessionId: "stale-provider-session",
      providerStateJson: "{}",
      providerVersion: null,
      resumable: true,
      updatedAt: response.createdAt,
    });
    resolveMessage(response);
    await turn;

    expect(events).not.toContainEqual(
      expect.objectContaining({ type: "message.delta", delta: "stale" }),
    );
    expect(events).not.toContainEqual(
      expect.objectContaining({
        type: "turn.completed",
        messageId: response.id,
      }),
    );
    expect(persistence.onProviderSessionUpdate).not.toHaveBeenCalled();
  });

  it("keeps the runtime alive after a cancelled turn", async () => {
    const message: MessageRecord = {
      id: "assistant-1",
      sessionId: "session-1",
      role: "assistant",
      content: "done",
      attachments: [],
      createdAt: "2026-07-24T00:00:01.000Z",
    };
    const runtimeSession: AgentSession = {
      dispose: vi.fn(),
      sendMessage: vi.fn(async () => message),
      stop: vi.fn(),
    };
    const createSession = vi.fn(() => runtimeSession);
    const manager = new AgentRuntimeManager({
      broadcastAgentEvent: vi.fn(),
      createAdapter: () => ({
        getDescriptor() {
          throw new Error("Descriptor is not used by runtime tests");
        },
        createSession,
      }),
    });
    const payload = createPayload();
    const persistence = createPersistence();

    manager.createSessionRuntime(payload, persistence);
    expect(await manager.cancelSessionTurn(payload.session.id)).toBe(true);

    await manager.sendSessionMessage(payload, { ...persistence, history: [] });

    expect(runtimeSession.stop).toHaveBeenCalledTimes(1);
    expect(runtimeSession.dispose).not.toHaveBeenCalled();
    expect(createSession).toHaveBeenCalledTimes(1);
  });
});
