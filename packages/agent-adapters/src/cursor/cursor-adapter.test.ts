import type {
  InitializeResponse,
  PromptResponse,
} from "@agentclientprotocol/sdk";
import type { SessionRecord } from "@cocurdex/shared";
import { describe, expect, it, vi } from "vitest";
import type {
  AcpConnection,
  AcpConnectionFactory,
} from "../acp/acp-connection";
import {
  CURSOR_ACP_ARGS,
  CURSOR_ACP_AUTH_METHOD,
  CURSOR_ACP_COMMAND,
  createCursorAdapter,
} from "./cursor-adapter";

function createSessionRecord(): SessionRecord {
  return {
    id: "app-session-1",
    workspaceId: "workspace-1",
    title: "Cursor ACP",
    agentType: "cursor",
    status: "idle",
    writeMode: "native-write",
    sessionModeId: null,
    createdAt: "2026-09-16T00:00:00.000Z",
    updatedAt: "2026-09-16T00:00:00.000Z",
    lastMessageAt: null,
  };
}

describe("createCursorAdapter", () => {
  it("starts Cursor CLI ACP over stdio and authenticates with cursor_login", async () => {
    const authenticate = vi.fn(async () => ({}));
    const newSession = vi.fn(async () => ({ sessionId: "cursor-session-1" }));
    const prompt = vi.fn(
      async (): Promise<PromptResponse> => ({ stopReason: "end_turn" }),
    );
    const connection = {
      initialize: vi.fn(
        async (): Promise<InitializeResponse> => ({
          protocolVersion: 1,
          agentCapabilities: {},
          authMethods: [{ id: CURSOR_ACP_AUTH_METHOD, name: "Cursor Login" }],
        }),
      ),
      authenticate,
      newSession,
      loadSession: vi.fn(async () => ({})),
      resumeSession: vi.fn(async () => ({})),
      setSessionMode: vi.fn(async () => ({})),
      setSessionConfigOption: vi.fn(async () => ({ configOptions: [] })),
      setSessionModel: vi.fn(async () => ({})),
      extNotification: vi.fn(async () => undefined),
      extRequest: vi.fn(async () => ({})),
      prompt,
      cancel: vi.fn(async () => undefined),
      close: vi.fn(),
    } satisfies AcpConnection;
    const connectionFactory: AcpConnectionFactory = vi.fn(async (options) => {
      expect(options.command).toBe(CURSOR_ACP_COMMAND);
      expect(options.args).toEqual(CURSOR_ACP_ARGS);
      expect(options.cwd).toBe("/workspace");
      return connection;
    });
    const adapter = createCursorAdapter(connectionFactory);
    const session = adapter.createSession(
      {
        session: createSessionRecord(),
        workspaceRootPath: "/workspace",
      },
      vi.fn(),
    );

    expect(adapter.getDescriptor()).toMatchObject({
      id: "cursor",
      capabilities: {
        transport: "acp",
        supportsSteering: false,
        writeModes: ["native-write"],
      },
    });

    await session.sendMessage({
      content: "Hello",
      attachments: [],
      history: [],
    });

    expect(connectionFactory).toHaveBeenCalled();
    expect(authenticate).toHaveBeenCalledWith({
      methodId: CURSOR_ACP_AUTH_METHOD,
    });
    expect(newSession).toHaveBeenCalled();
    expect(prompt).toHaveBeenCalled();
  });
});
