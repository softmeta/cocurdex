import type {
  InitializeResponse,
  PromptResponse,
} from "@agentclientprotocol/sdk";
import { RequestError } from "@agentclientprotocol/sdk";
import { AgentSteeringUnavailableError } from "@cocurdex/agent-core";
import type { AgentEvent, SessionRecord } from "@cocurdex/shared";
import { describe, expect, it, vi } from "vitest";
import type { AcpConnection } from "../acp/acp-connection";
import { createGrokBuildAdapter } from "./grok-build-adapter";

function createSessionRecord(): SessionRecord {
  return {
    id: "app-session-1",
    workspaceId: "workspace-1",
    title: "Grok steering",
    agentType: "grok-build",
    status: "idle",
    writeMode: "native-write",
    collaborationMode: "default",
    createdAt: "2026-08-02T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
    lastMessageAt: null,
  };
}

describe("GrokBuildAdapter steering", () => {
  it("injects a follow-up and reports unsupported Grok versions", async () => {
    const extRequest = vi.fn(async () => ({ status: "queued" }));
    const prompt = vi.fn(
      async (): Promise<PromptResponse> => ({ stopReason: "end_turn" }),
    );
    const connection = {
      initialize: vi.fn(
        async (): Promise<InitializeResponse> => ({
          protocolVersion: 1,
          agentCapabilities: {},
        }),
      ),
      authenticate: vi.fn(async () => ({})),
      newSession: vi.fn(async () => ({ sessionId: "grok-session-1" })),
      loadSession: vi.fn(async () => ({})),
      resumeSession: vi.fn(async () => ({})),
      setSessionMode: vi.fn(async () => ({})),
      setSessionConfigOption: vi.fn(async () => ({ configOptions: [] })),
      setSessionModel: vi.fn(async () => ({})),
      extNotification: vi.fn(async () => undefined),
      extRequest,
      prompt,
      cancel: vi.fn(async () => undefined),
      close: vi.fn(),
    } satisfies AcpConnection;
    const adapter = createGrokBuildAdapter(async () => connection);
    const session = adapter.createSession(
      {
        session: createSessionRecord(),
        workspaceRootPath: "/workspace",
      },
      vi.fn(),
    );

    const accepted = await session.sendMessage({
      messageId: "message-1",
      content: "Change course",
      attachments: [],
      history: [],
      delivery: "steer-active-run",
    });

    expect(adapter.getDescriptor().capabilities.supportsSteering).toBe(true);
    expect(extRequest).toHaveBeenCalledWith("x.ai/interject", {
      sessionId: "grok-session-1",
      text: "Change course",
      interjectionId: "message-1",
      content: [{ type: "text", text: "Change course" }],
    });
    expect(prompt).not.toHaveBeenCalled();
    expect(accepted).toMatchObject({
      id: "message-1",
      sessionId: "app-session-1",
      role: "user",
      content: "Change course",
    });

    extRequest.mockRejectedValueOnce(
      RequestError.methodNotFound("_x.ai/interject"),
    );
    await expect(
      session.sendMessage({
        messageId: "message-2",
        content: "Try again",
        attachments: [],
        history: [],
        delivery: "steer-active-run",
      }),
    ).rejects.toBeInstanceOf(AgentSteeringUnavailableError);
  });

  it("publishes the current Grok weekly credit usage", async () => {
    const events: AgentEvent[] = [];
    const connection = {
      initialize: vi.fn(
        async (): Promise<InitializeResponse> => ({
          protocolVersion: 1,
          agentCapabilities: {},
        }),
      ),
      authenticate: vi.fn(async () => ({})),
      newSession: vi.fn(async () => ({ sessionId: "grok-session-1" })),
      loadSession: vi.fn(async () => ({})),
      resumeSession: vi.fn(async () => ({})),
      setSessionMode: vi.fn(async () => ({})),
      setSessionConfigOption: vi.fn(async () => ({ configOptions: [] })),
      setSessionModel: vi.fn(async () => ({})),
      extNotification: vi.fn(async () => undefined),
      extRequest: vi.fn(async () => ({
        config: {
          creditUsagePercent: 65,
          currentPeriod: {
            type: "USAGE_PERIOD_TYPE_WEEKLY",
            end: "2026-08-10T00:00:00Z",
          },
        },
      })),
      prompt: vi.fn(
        async (): Promise<PromptResponse> => ({ stopReason: "end_turn" }),
      ),
      cancel: vi.fn(async () => undefined),
      close: vi.fn(),
    } satisfies AcpConnection;
    const session = createGrokBuildAdapter(
      async () => connection,
    ).createSession(
      {
        session: createSessionRecord(),
        workspaceRootPath: "/workspace",
      },
      (event) => events.push(event),
    );

    await session.sendMessage({ content: "Start", history: [] });
    await vi.waitFor(() =>
      expect(events.some((event) => event.type === "rate_limits.updated")).toBe(
        true,
      ),
    );

    expect(connection.extRequest).toHaveBeenCalledWith("x.ai/models/list", {});
    expect(connection.extRequest).toHaveBeenCalledWith("x.ai/billing", {});
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "rate_limits.updated",
        rateLimits: expect.objectContaining({
          windows: [
            expect.objectContaining({ kind: "weekly", usedPercent: 65 }),
          ],
        }),
      }),
    );
  });

  it("waits for the remote model catalog before opening a session", async () => {
    const order: string[] = [];
    const connection = {
      initialize: vi.fn(async (): Promise<InitializeResponse> => {
        order.push("initialize");
        return { protocolVersion: 1, agentCapabilities: {} };
      }),
      authenticate: vi.fn(async () => ({})),
      newSession: vi.fn(async () => {
        order.push("newSession");
        return { sessionId: "grok-session-1" };
      }),
      loadSession: vi.fn(async () => ({})),
      resumeSession: vi.fn(async () => ({})),
      setSessionMode: vi.fn(async () => ({})),
      setSessionConfigOption: vi.fn(async () => ({ configOptions: [] })),
      setSessionModel: vi.fn(async () => ({})),
      extNotification: vi.fn(async () => undefined),
      extRequest: vi.fn(async (method: string) => {
        order.push(method);
        return {};
      }),
      prompt: vi.fn(
        async (): Promise<PromptResponse> => ({ stopReason: "end_turn" }),
      ),
      cancel: vi.fn(async () => undefined),
      close: vi.fn(),
    } satisfies AcpConnection;
    const session = createGrokBuildAdapter(
      async () => connection,
    ).createSession(
      {
        session: createSessionRecord(),
        workspaceRootPath: "/workspace",
      },
      vi.fn(),
    );

    await session.sendMessage({ content: "Start", history: [] });

    expect(order.indexOf("x.ai/models/list")).toBeGreaterThan(
      order.indexOf("initialize"),
    );
    expect(order.indexOf("newSession")).toBeGreaterThan(
      order.indexOf("x.ai/models/list"),
    );
  });

  it("publishes the session MCP catalog after the Grok process is up", async () => {
    const events: AgentEvent[] = [];
    const connection = {
      initialize: vi.fn(
        async (): Promise<InitializeResponse> => ({
          protocolVersion: 1,
          agentCapabilities: {},
        }),
      ),
      authenticate: vi.fn(async () => ({})),
      newSession: vi.fn(async () => ({ sessionId: "grok-session-1" })),
      loadSession: vi.fn(async () => ({})),
      resumeSession: vi.fn(async () => ({})),
      setSessionMode: vi.fn(async () => ({})),
      setSessionConfigOption: vi.fn(async () => ({ configOptions: [] })),
      setSessionModel: vi.fn(async () => ({})),
      extNotification: vi.fn(async () => undefined),
      extRequest: vi.fn(async (method: string) => {
        if (method === "x.ai/mcp/list") {
          return {
            result: {
              servers: [
                {
                  name: "context7",
                  session: { enabled: true, status: "ready" },
                },
              ],
            },
          };
        }
        return {};
      }),
      prompt: vi.fn(
        async (): Promise<PromptResponse> => ({ stopReason: "end_turn" }),
      ),
      cancel: vi.fn(async () => undefined),
      close: vi.fn(),
    } satisfies AcpConnection;
    const session = createGrokBuildAdapter(
      async () => connection,
    ).createSession(
      {
        session: createSessionRecord(),
        workspaceRootPath: "/workspace",
      },
      (event) => events.push(event),
    );

    await session.sendMessage({ content: "Start", history: [] });
    await vi.waitFor(() =>
      expect(
        events.some((event) => event.type === "provider.runtime.updated"),
      ).toBe(true),
    );

    expect(connection.extRequest).toHaveBeenCalledWith("x.ai/mcp/list", {
      cache: true,
      sessionId: "grok-session-1",
    });
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "provider.runtime.updated",
        runtime: expect.objectContaining({
          providerId: "grok-build",
          mcpServers: [{ name: "context7", status: "connected" }],
        }),
      }),
    );
  });

  it("re-reads the MCP catalog when Grok pushes a server status change", async () => {
    const events: AgentEvent[] = [];
    let mcpListCalls = 0;
    let notifyExt: ((method: string) => void) | undefined;
    let endTurn: (() => void) | undefined;
    const connection = {
      initialize: vi.fn(
        async (): Promise<InitializeResponse> => ({
          protocolVersion: 1,
          agentCapabilities: {},
        }),
      ),
      authenticate: vi.fn(async () => ({})),
      newSession: vi.fn(async () => ({ sessionId: "grok-session-1" })),
      loadSession: vi.fn(async () => ({})),
      resumeSession: vi.fn(async () => ({})),
      setSessionMode: vi.fn(async () => ({})),
      setSessionConfigOption: vi.fn(async () => ({ configOptions: [] })),
      setSessionModel: vi.fn(async () => ({})),
      extNotification: vi.fn(async () => undefined),
      extRequest: vi.fn(async (method: string) => {
        if (method === "x.ai/mcp/list") {
          mcpListCalls += 1;
          return {
            result: {
              servers: [
                {
                  name: "context7",
                  session: {
                    enabled: true,
                    status: mcpListCalls > 1 ? "ready" : "initializing",
                  },
                },
              ],
            },
          };
        }
        return {};
      }),
      prompt: vi.fn(
        (): Promise<PromptResponse> =>
          new Promise((resolve) => {
            endTurn = () => resolve({ stopReason: "end_turn" });
          }),
      ),
      cancel: vi.fn(async () => undefined),
      close: vi.fn(),
    } satisfies AcpConnection;
    const session = createGrokBuildAdapter(async (options) => {
      expect(options.extNotificationMethods).toContain(
        "x.ai/mcp/server_status",
      );
      notifyExt = (method) => options.handlers.onExtNotification?.(method);
      return connection;
    }).createSession(
      {
        session: createSessionRecord(),
        workspaceRootPath: "/workspace",
      },
      (event) => events.push(event),
    );

    // A turn that never ends: the catalog only moves because Grok pushed.
    const turn = session.sendMessage({ content: "Start", history: [] });
    await vi.waitFor(() => expect(mcpListCalls).toBe(1));
    notifyExt?.("x.ai/mcp/server_status");
    await vi.waitFor(() =>
      expect(
        events.filter((event) => event.type === "provider.runtime.updated"),
      ).toHaveLength(2),
    );
    endTurn?.();
    await turn;

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "provider.runtime.updated",
        runtime: expect.objectContaining({
          mcpServers: [{ name: "context7", status: "connected" }],
        }),
      }),
    );
  });
});
