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
  createDevinAdapter,
  DEVIN_ACP_ARGS,
  DEVIN_ACP_COMMAND,
} from "./devin-adapter";

function createSessionRecord(): SessionRecord {
  return {
    id: "app-session-1",
    workspaceId: "workspace-1",
    title: "Devin ACP",
    agentType: "devin",
    status: "idle",
    writeMode: "native-write",
    sessionModeId: null,
    createdAt: "2026-09-16T00:00:00.000Z",
    updatedAt: "2026-09-16T00:00:00.000Z",
    lastMessageAt: null,
  };
}

describe("createDevinAdapter", () => {
  it("starts Devin CLI ACP over stdio", async () => {
    const authenticate = vi.fn(async () => ({}));
    const newSession = vi.fn(async () => ({ sessionId: "devin-session-1" }));
    const prompt = vi.fn(
      async (): Promise<PromptResponse> => ({ stopReason: "end_turn" }),
    );
    const connection = {
      initialize: vi.fn(
        async (): Promise<InitializeResponse> => ({
          protocolVersion: 1,
          agentCapabilities: {},
          authMethods: [{ id: "devin-browser", name: "Log in with browser" }],
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
      expect(options.command).toBe(DEVIN_ACP_COMMAND);
      expect(options.args).toEqual(DEVIN_ACP_ARGS);
      expect(options.cwd).toBe("/workspace");
      return connection;
    });
    const adapter = createDevinAdapter(connectionFactory);
    const session = adapter.createSession(
      {
        session: createSessionRecord(),
        workspaceRootPath: "/workspace",
      },
      vi.fn(),
    );

    expect(adapter.getDescriptor()).toMatchObject({
      id: "devin",
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
    expect(authenticate).not.toHaveBeenCalled();
    expect(newSession).toHaveBeenCalled();
    expect(prompt).toHaveBeenCalled();
  });
});
