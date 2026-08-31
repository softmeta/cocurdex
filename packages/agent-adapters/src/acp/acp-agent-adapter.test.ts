import type {
  InitializeResponse,
  PromptResponse,
  RequestPermissionRequest,
} from "@agentclientprotocol/sdk";
import type {
  AgentDescriptor,
  AgentEvent,
  AgentProviderSessionRecord,
  MessageRecord,
} from "@cocurdex/shared";
import { describe, expect, it, vi } from "vitest";
import {
  AcpAgentAdapter,
  type AcpConnection,
  type AcpConnectionFactory,
} from "./acp-agent-adapter";

const descriptor: AgentDescriptor = {
  id: "grok-build",
  label: "Grok Build",
  availability: "available",
  capabilities: {
    collaborationModes: ["default", "plan"],
    permissionModes: [],
    writeModes: ["read-only", "native-write"],
    supportsSteering: false,
    supportsSelections: true,
    supportsStreaming: true,
    sessionTitleStrategy: "native",
    transport: "acp",
  },
};

function createHistory(sessionId: string): MessageRecord[] {
  return [
    {
      id: "user-1",
      sessionId,
      role: "user",
      content: "Earlier request",
      attachments: [],
      createdAt: "2026-07-24T00:00:00.000Z",
    },
  ];
}

function createAcpConnection(
  overrides: Partial<AcpConnection> = {},
): AcpConnection {
  return {
    initialize: async () => ({
      protocolVersion: 1,
      agentCapabilities: {},
    }),
    authenticate: async () => ({}),
    newSession: async () => ({ sessionId: "new-session" }),
    loadSession: async () => ({}),
    resumeSession: async () => ({}),
    setSessionMode: async () => ({}),
    setSessionModel: async () => ({}),
    extNotification: async () => {},
    extRequest: async () => ({}),
    setSessionConfigOption: async () => ({ configOptions: [] }),
    prompt: async (): Promise<PromptResponse> => ({
      stopReason: "end_turn",
    }),
    cancel: async () => undefined,
    close: () => Promise.resolve(),
    ...overrides,
  };
}

describe("AcpAgentAdapter", () => {
  it("negotiates ACP, creates a provider session, and maps a prompt turn", async () => {
    const events: AgentEvent[] = [];
    const providerUpdates: AgentProviderSessionRecord[] = [];
    let handlers: Parameters<AcpConnectionFactory>[0]["handlers"] | undefined;

    const connection: AcpConnection = {
      initialize: vi.fn(
        async (): Promise<InitializeResponse> => ({
          protocolVersion: 1,
          agentCapabilities: {
            loadSession: true,
            promptCapabilities: {
              image: true,
            },
            sessionCapabilities: {
              resume: {},
            },
          },
          authMethods: [{ id: "cached_token", name: "Cached token" }],
        }),
      ),
      authenticate: vi.fn(async () => ({})),
      newSession: vi.fn(async () => ({
        sessionId: "grok-session-1",
        modes: {
          currentModeId: "default",
          availableModes: [
            { id: "default", name: "Default" },
            { id: "plan", name: "Plan" },
          ],
        },
        models: {
          currentModelId: "grok-4.5",
          availableModels: [
            { modelId: "grok-4.5", name: "Grok 4.5" },
            { modelId: "grok-mini", name: "Grok Mini" },
          ],
        },
      })),
      loadSession: vi.fn(async () => ({})),
      resumeSession: vi.fn(async () => ({})),
      setSessionMode: vi.fn(async () => ({})),
      setSessionModel: vi.fn(async () => ({})),
      extNotification: vi.fn(async () => {}),
      extRequest: vi.fn(async () => ({})),
      setSessionConfigOption: vi.fn(async () => ({
        configOptions: [
          {
            id: "safe-mode",
            name: "Safe mode",
            type: "boolean" as const,
            currentValue: true,
          },
        ],
      })),
      prompt: vi.fn(async (): Promise<PromptResponse> => {
        await handlers?.onSessionUpdate({
          sessionId: "grok-session-1",
          update: {
            sessionUpdate: "agent_message_chunk",
            messageId: "assistant-1",
            content: { type: "text", text: "Done" },
          },
        });
        return { stopReason: "end_turn" };
      }),
      cancel: vi.fn(async () => undefined),
      close: vi.fn(),
    };
    const connectionFactory: AcpConnectionFactory = vi.fn(async (options) => {
      handlers = options.handlers;
      return connection;
    });
    const adapter = new AcpAgentAdapter(
      {
        args: ["--no-auto-update", "agent", "stdio"],
        authMethodPriority: ["cached_token"],
        command: "grok",
        descriptor,
        modelProviderId: descriptor.id,
      },
      connectionFactory,
    );
    const sessionId = "app-session-1";
    const session = adapter.createSession(
      {
        session: {
          id: sessionId,
          workspaceId: "workspace-1",
          title: "Test",
          agentType: "grok-build",
          status: "idle",
          writeMode: "native-write",
          collaborationMode: "plan",
          createdAt: "2026-07-24T00:00:00.000Z",
          updatedAt: "2026-07-24T00:00:00.000Z",
          lastMessageAt: null,
        },
        workspaceRootPath: "/workspace",
        onProviderSessionUpdate(update) {
          if (update) {
            providerUpdates.push(update);
          }
        },
      },
      (event) => events.push(event),
    );

    const result = await session.sendMessage({
      content: "Continue",
      attachments: [],
      history: createHistory(sessionId),
      providerSnapshot: {
        providerId: "grok-build",
        providerName: "Grok Build",
        modelId: "grok-mini",
        modelName: "Grok Mini",
        api: "openai-completions",
        baseUrl: "https://example.test",
      },
    });
    await session.setMode?.("default");
    await session.setConfigOption?.("safe-mode", true);

    expect(connection.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        protocolVersion: 1,
        clientInfo: expect.objectContaining({ name: "Cocurdex" }),
      }),
    );
    expect(connection.authenticate).toHaveBeenCalledWith({
      methodId: "cached_token",
    });
    expect(connection.newSession).toHaveBeenCalledWith({
      cwd: "/workspace",
      mcpServers: [],
    });
    expect(connection.setSessionModel).toHaveBeenCalledWith({
      sessionId: "grok-session-1",
      modelId: "grok-mini",
    });
    expect(connection.prompt).toHaveBeenCalledWith({
      sessionId: "grok-session-1",
      prompt: [{ type: "text", text: "Continue" }],
    });
    expect(connection.setSessionMode).toHaveBeenNthCalledWith(1, {
      sessionId: "grok-session-1",
      modeId: "plan",
    });
    expect(connection.setSessionMode).toHaveBeenNthCalledWith(2, {
      sessionId: "grok-session-1",
      modeId: "default",
    });
    expect(connection.setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: "grok-session-1",
      configId: "safe-mode",
      type: "boolean",
      value: true,
    });
    expect(providerUpdates).toEqual([
      expect.objectContaining({
        providerSessionId: "grok-session-1",
        resumable: true,
      }),
    ]);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "capabilities.updated",
        capabilities: expect.objectContaining({
          protocol: { kind: "acp", version: 1 },
          loadSession: true,
          resumeSession: true,
        }),
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "message.delta",
        delta: "Done",
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "turn.completed",
        stopReason: "end_turn",
      }),
    );
    expect(events).toContainEqual({
      type: "session.mode.updated",
      sessionId,
      currentModeId: "default",
    });
    expect(events).toContainEqual({
      type: "session.config.updated",
      sessionId,
      configOptions: [
        {
          id: "safe-mode",
          name: "Safe mode",
          type: "boolean",
          currentValue: true,
        },
      ],
    });
    expect(result).toMatchObject({
      sessionId,
      role: "assistant",
      content: "Done",
    });
    const deltaEvent = events.find((event) => event.type === "message.delta");
    expect(result.id).toBe(
      deltaEvent?.type === "message.delta" ? deltaEvent.messageId : null,
    );
  });

  it("ignores a persisted ACP session marked non-resumable", async () => {
    const resumeSession = vi.fn(async () => ({}));
    const loadSession = vi.fn(async () => ({}));
    const newSession = vi.fn(async () => ({ sessionId: "replacement" }));
    const connection = createAcpConnection({
      initialize: async () => ({
        protocolVersion: 1,
        agentCapabilities: { loadSession: true },
      }),
      newSession,
      loadSession,
      resumeSession,
    });
    const session = new AcpAgentAdapter(
      {
        args: ["agent", "stdio"],
        command: "grok",
        descriptor,
      },
      async () => connection,
    ).createSession(
      {
        session: {
          id: "non-resumable-session",
          workspaceId: "workspace-1",
          title: "Non-resumable",
          agentType: "grok-build",
          status: "idle",
          writeMode: "native-write",
          collaborationMode: "default",
          createdAt: "2026-07-24T00:00:00.000Z",
          updatedAt: "2026-07-24T00:00:00.000Z",
          lastMessageAt: null,
        },
        workspaceRootPath: "/workspace",
        providerSession: {
          sessionId: "non-resumable-session",
          providerSessionId: "stale-session",
          providerStateJson: "{}",
          providerVersion: null,
          resumable: false,
          updatedAt: "2026-07-24T00:00:00.000Z",
        },
      },
      () => undefined,
    );

    await session.sendMessage({ content: "Start", history: [] });

    expect(resumeSession).not.toHaveBeenCalled();
    expect(loadSession).not.toHaveBeenCalled();
    expect(newSession).toHaveBeenCalledOnce();
  });

  it("retries ACP initialization after a failed startup", async () => {
    const initialize = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary startup failure"))
      .mockResolvedValueOnce({
        protocolVersion: 1,
        agentCapabilities: {},
      });
    const connection = createAcpConnection({ initialize });
    const connectionFactory = vi.fn(async () => connection);
    const session = new AcpAgentAdapter(
      {
        args: ["agent", "stdio"],
        command: "grok",
        descriptor,
      },
      connectionFactory,
    ).createSession(
      {
        session: {
          id: "retry-session",
          workspaceId: "workspace-1",
          title: "Retry",
          agentType: "grok-build",
          status: "idle",
          writeMode: "native-write",
          collaborationMode: "default",
          createdAt: "2026-07-24T00:00:00.000Z",
          updatedAt: "2026-07-24T00:00:00.000Z",
          lastMessageAt: null,
        },
        workspaceRootPath: "/workspace",
      },
      () => undefined,
    );

    await expect(
      session.sendMessage({ content: "First attempt", history: [] }),
    ).rejects.toThrow("temporary startup failure");
    await session.sendMessage({ content: "Retry", history: [] });

    expect(connectionFactory).toHaveBeenCalledTimes(2);
    expect(initialize).toHaveBeenCalledTimes(2);
  });

  it("pushes the permission mode as an ext notification, once per change", async () => {
    const extNotification = vi.fn(async () => {});
    const connectionFactory: AcpConnectionFactory = vi.fn(
      async () =>
        ({
          initialize: async () => ({ protocolVersion: 1 }),
          authenticate: async () => ({}),
          newSession: async () => ({ sessionId: "grok-session-1" }),
          loadSession: async () => ({}),
          resumeSession: async () => ({}),
          setSessionMode: async () => ({}),
          setSessionModel: async () => ({}),
          extNotification,
          setSessionConfigOption: async () => ({ configOptions: [] }),
          prompt: async () => ({ stopReason: "end_turn" as const }),
          cancel: async () => undefined,
          close: () => Promise.resolve(),
        }) as unknown as AcpConnection,
    );
    const adapter = new AcpAgentAdapter(
      {
        args: [],
        command: "grok",
        descriptor,
        permissionModeNotification: {
          method: "x.ai/yolo_mode_changed",
          buildParams: (mode) =>
            mode === "grok-always-approve"
              ? { permission_mode: "always-approve", yolo_mode: true }
              : { permission_mode: "ask", yolo_mode: false, auto_mode: false },
        },
      },
      connectionFactory,
    );
    const sessionId = "app-session-2";
    const session = adapter.createSession(
      {
        session: {
          id: sessionId,
          workspaceId: "workspace-1",
          title: "Test",
          agentType: "grok-build",
          status: "idle",
          writeMode: "native-write",
          collaborationMode: "default",
          permissionMode: "grok-ask",
          createdAt: "2026-07-24T00:00:00.000Z",
          updatedAt: "2026-07-24T00:00:00.000Z",
          lastMessageAt: null,
        },
        workspaceRootPath: "/workspace",
      },
      () => {},
    );

    await session.sendMessage({ content: "one", attachments: [], history: [] });
    // Same mode again must not re-notify.
    await session.sendMessage({
      content: "two",
      attachments: [],
      history: [],
      permissionMode: "grok-ask",
    });
    await session.sendMessage({
      content: "three",
      attachments: [],
      history: [],
      permissionMode: "grok-always-approve",
    });

    expect(extNotification).toHaveBeenCalledTimes(2);
    expect(extNotification).toHaveBeenNthCalledWith(
      1,
      "x.ai/yolo_mode_changed",
      {
        permission_mode: "ask",
        yolo_mode: false,
        auto_mode: false,
      },
    );
    expect(extNotification).toHaveBeenNthCalledWith(
      2,
      "x.ai/yolo_mode_changed",
      {
        permission_mode: "always-approve",
        yolo_mode: true,
      },
    );
  });

  it("maps Cocurdex permission decisions to the ACP option selected by kind", async () => {
    let handlers: Parameters<AcpConnectionFactory>[0]["handlers"] | undefined;
    const connectionFactory: AcpConnectionFactory = vi.fn(async (options) => {
      handlers = options.handlers;
      return {
        initialize: async () => ({ protocolVersion: 1 }),
        authenticate: async () => ({}),
        newSession: async () => ({ sessionId: "unused" }),
        loadSession: async () => ({}),
        resumeSession: async () => ({}),
        setSessionMode: async () => ({}),
        setSessionModel: async () => ({}),
        extNotification: async () => {},
        extRequest: async () => ({}),
        setSessionConfigOption: async () => ({ configOptions: [] }),
        prompt: async (): Promise<PromptResponse> => ({
          stopReason: "end_turn",
        }),
        cancel: async () => undefined,
        close: () => Promise.resolve(),
      };
    });
    const adapter = new AcpAgentAdapter(
      {
        args: ["agent", "stdio"],
        command: "grok",
        descriptor,
      },
      connectionFactory,
    );
    adapter.createSession(
      {
        session: {
          id: "app-session-1",
          workspaceId: "workspace-1",
          title: "Test",
          agentType: "grok-build",
          status: "idle",
          writeMode: "native-write",
          collaborationMode: "default",
          createdAt: "2026-07-24T00:00:00.000Z",
          updatedAt: "2026-07-24T00:00:00.000Z",
          lastMessageAt: null,
        },
        workspaceRootPath: "/workspace",
        requestPermission: vi.fn(async () => "allow_always" as const),
      },
      () => undefined,
    );

    await vi.waitFor(() => expect(handlers).toBeDefined());
    const request: RequestPermissionRequest = {
      sessionId: "unused",
      toolCall: {
        toolCallId: "tool-1",
        title: "Run tests",
        kind: "execute",
      },
      options: [
        {
          optionId: "once",
          name: "Allow once",
          kind: "allow_once",
        },
        {
          optionId: "always",
          name: "Always allow",
          kind: "allow_always",
        },
        {
          optionId: "reject",
          name: "Reject",
          kind: "reject_once",
        },
      ],
    };

    await expect(handlers?.requestPermission(request)).resolves.toEqual({
      outcome: {
        outcome: "selected",
        optionId: "always",
      },
    });
  });

  it("fails before sending when the saved ACP session cannot be loaded", async () => {
    const prompt = vi.fn(
      async (): Promise<PromptResponse> => ({ stopReason: "end_turn" }),
    );
    const connection: AcpConnection = {
      initialize: async () => ({
        protocolVersion: 1,
        agentCapabilities: { loadSession: true },
      }),
      authenticate: async () => ({}),
      newSession: vi.fn(async () => ({ sessionId: "replacement-session" })),
      loadSession: vi.fn(async () => {
        throw new Error("session not found");
      }),
      resumeSession: async () => ({}),
      setSessionMode: async () => ({}),
      setSessionModel: async () => ({}),
      extNotification: async () => {},
      extRequest: async () => ({}),
      setSessionConfigOption: async () => ({ configOptions: [] }),
      prompt,
      cancel: async () => undefined,
      close: () => Promise.resolve(),
    };
    const adapter = new AcpAgentAdapter(
      {
        args: ["agent", "stdio"],
        command: "grok",
        descriptor,
      },
      async () => connection,
    );
    const session = adapter.createSession(
      {
        session: {
          id: "app-session-1",
          workspaceId: "workspace-1",
          title: "Test",
          agentType: "grok-build",
          status: "idle",
          writeMode: "native-write",
          collaborationMode: "default",
          createdAt: "2026-07-24T00:00:00.000Z",
          updatedAt: "2026-07-24T00:00:00.000Z",
          lastMessageAt: null,
        },
        workspaceRootPath: "/workspace",
        providerSession: {
          sessionId: "app-session-1",
          providerSessionId: "missing-session",
          providerStateJson: "{}",
          providerVersion: null,
          resumable: true,
          updatedAt: "2026-07-24T00:00:00.000Z",
        },
      },
      () => undefined,
    );
    const history = [
      ...createHistory("app-session-1"),
      {
        id: "assistant-old",
        sessionId: "app-session-1",
        role: "assistant" as const,
        content: "Earlier answer",
        attachments: [],
        createdAt: "2026-07-24T00:00:01.000Z",
      },
      {
        id: "user-current",
        sessionId: "app-session-1",
        role: "user" as const,
        content: "Continue",
        attachments: [],
        createdAt: "2026-07-24T00:00:02.000Z",
      },
    ];

    await expect(
      session.sendMessage({
        content: "Continue",
        attachments: [],
        history,
      }),
    ).rejects.toThrow("could not restore its native session");

    expect(connection.newSession).not.toHaveBeenCalled();
    expect(prompt).not.toHaveBeenCalled();
  });

  it("loads without replay and cancels the turn without closing the session", async () => {
    const connection: AcpConnection = {
      initialize: async () => ({
        protocolVersion: 1,
        agentCapabilities: { loadSession: true },
      }),
      authenticate: async () => ({}),
      newSession: vi.fn(async () => ({ sessionId: "unused-session" })),
      loadSession: vi.fn(async () => ({})),
      resumeSession: async () => ({}),
      setSessionMode: async () => ({}),
      setSessionModel: async () => ({}),
      extNotification: async () => {},
      extRequest: async () => ({}),
      setSessionConfigOption: async () => ({ configOptions: [] }),
      prompt: async (): Promise<PromptResponse> => ({
        stopReason: "end_turn",
      }),
      cancel: vi.fn(async () => undefined),
      close: vi.fn(() => Promise.resolve()),
    };
    const adapter = new AcpAgentAdapter(
      {
        args: ["agent", "stdio"],
        command: "grok",
        descriptor,
      },
      async () => connection,
    );
    const session = adapter.createSession(
      {
        session: {
          id: "app-session-1",
          workspaceId: "workspace-1",
          title: "Test",
          agentType: "grok-build",
          status: "idle",
          writeMode: "native-write",
          collaborationMode: "default",
          createdAt: "2026-07-24T00:00:00.000Z",
          updatedAt: "2026-07-24T00:00:00.000Z",
          lastMessageAt: null,
        },
        workspaceRootPath: "/workspace",
        providerSession: {
          sessionId: "app-session-1",
          providerSessionId: "existing-session",
          providerStateJson: "{}",
          providerVersion: null,
          resumable: true,
          updatedAt: "2026-07-24T00:00:00.000Z",
        },
      },
      () => undefined,
    );

    await session.sendMessage({
      content: "Continue",
      attachments: [],
      history: createHistory("app-session-1"),
    });
    await session.stop();

    expect(connection.loadSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "existing-session",
        _meta: { noReplay: true },
      }),
    );
    expect(connection.newSession).not.toHaveBeenCalled();
    expect(connection.cancel).toHaveBeenCalledWith({
      sessionId: "existing-session",
      _meta: { cancelTrigger: "client_stop" },
    });
    expect(connection.close).not.toHaveBeenCalled();
  });

  it("routes extension-linked child updates into the child session", async () => {
    const events: AgentEvent[] = [];
    let handlers: Parameters<AcpConnectionFactory>[0]["handlers"] | undefined;
    const loadSession = vi.fn(async (request) => {
      if (request.sessionId === "provider-child") {
        await handlers?.onSessionUpdate({
          sessionId: "provider-child",
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "Child output" },
          },
        });
        handlers?.onExtNotification?.("vendor/subagents", {
          sessionId: "provider-child",
          update: {
            sessionUpdate: "turn_completed",
            stop_reason: "end_turn",
            elapsed_ms: 100,
          },
        });
      }
      return {};
    });
    const connection = createAcpConnection({
      newSession: async () => ({ sessionId: "provider-parent" }),
      prompt: async () => {
        await handlers?.onSessionUpdate({
          sessionId: "provider-parent",
          update: {
            sessionUpdate: "tool_call",
            toolCallId: "spawn-1",
            title: "Subagent",
            rawInput: { description: "Review", subagent_type: "reviewer" },
          },
        });
        handlers?.onExtNotification?.("vendor/subagents", {
          childSessionId: "provider-child",
        });
        await Promise.resolve();
        await Promise.resolve();
        handlers?.onExtNotification?.("vendor/subagents", {
          childSessionId: "provider-child",
          status: "completed",
        });
        handlers?.onExtNotification?.("vendor/subagents", {
          childSessionId: "provider-child",
          status: "completed",
        });
        return { stopReason: "end_turn" };
      },
    });
    const replayConnection = createAcpConnection({ loadSession });
    let connectionCount = 0;
    const adapter = new AcpAgentAdapter(
      {
        args: ["agent", "stdio"],
        command: "grok",
        descriptor,
        subagentProtocol: {
          notificationMethods: ["vendor/subagents"],
          replayLinkedSession: true,
          inspect(toolCall) {
            if (toolCall.title !== "Subagent") {
              return null;
            }
            return {
              kind: "spawn",
              providerSessionId: null,
              type: "reviewer",
              description: "Review",
            };
          },
          inspectNotification(_method, params) {
            const notification = params as {
              childSessionId: string;
              status?: string;
              update?: unknown;
            };
            if (notification.update) {
              return null;
            }
            const providerSessionId = notification.childSessionId;
            if (notification.status === "completed") {
              return {
                kind: "settlement",
                results: [{ providerSessionId, status: "completed" }],
              };
            }
            return {
              providerSessionId,
              type: "reviewer",
              description: "Review",
            };
          },
          readTurnCompletion(_method, params) {
            const notification = params as {
              sessionId?: string;
              update?: {
                sessionUpdate?: string;
                stop_reason?: string;
                elapsed_ms?: number;
              };
            };
            if (
              !notification.sessionId ||
              notification.update?.sessionUpdate !== "turn_completed"
            ) {
              return null;
            }
            return {
              providerSessionId: notification.sessionId,
              stopReason: "end_turn",
              durationMs: notification.update.elapsed_ms ?? 0,
            };
          },
        },
      },
      async (options) => {
        handlers = options.handlers;
        expect(options.extNotificationMethods).toContain("vendor/subagents");
        connectionCount += 1;
        return connectionCount === 1 ? connection : replayConnection;
      },
    );
    const session = adapter.createSession(
      {
        session: {
          id: "app-parent",
          workspaceId: "workspace-1",
          title: "Test",
          agentType: "grok-build",
          status: "idle",
          writeMode: "native-write",
          collaborationMode: "default",
          createdAt: "2026-07-24T00:00:00.000Z",
          updatedAt: "2026-07-24T00:00:00.000Z",
          lastMessageAt: null,
        },
        workspaceRootPath: "/workspace",
      },
      (event) => events.push(event),
    );

    await session.sendMessage({ content: "Start", history: [] });
    await vi.waitFor(() => expect(loadSession).toHaveBeenCalledOnce());
    expect(loadSession).toHaveBeenLastCalledWith({
      sessionId: "provider-child",
      cwd: "/workspace",
      mcpServers: [],
    });

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "message.delta",
        sessionId: "acp-subagent:app-parent:spawn-1",
        delta: "Child output",
      }),
    );
    expect(events).not.toContainEqual(
      expect.objectContaining({
        type: "message.delta",
        sessionId: "app-parent",
        delta: "Child output",
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "message.completed",
        sessionId: "acp-subagent:app-parent:spawn-1",
        message: expect.objectContaining({ content: "Child output" }),
      }),
    );
    expect(
      events.filter(
        (event) =>
          event.type === "message.delta" &&
          event.sessionId === "acp-subagent:app-parent:spawn-1",
      ),
    ).toHaveLength(1);
  });
});
