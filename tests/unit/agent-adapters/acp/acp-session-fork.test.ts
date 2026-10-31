import type {
  ForkSessionRequest,
  InitializeResponse,
} from "@agentclientprotocol/sdk";
import {
  AcpAgentAdapter,
  type AcpConnection,
} from "@cocurdex/agent-adapters/internal/acp/acp-agent-adapter";
import type { ForkProviderSessionPayload } from "@cocurdex/agent-core";
import type { AgentDescriptor } from "@cocurdex/shared";
import { describe, expect, it, vi } from "vitest";

const descriptor: AgentDescriptor = {
  id: "acp:example",
  label: "Example ACP",
  availability: "available",
  capabilities: {
    sessionModes: [],
    permissionModes: [],
    writeModes: ["read-only", "native-write"],
    supportsSteering: false,
    supportsSelections: false,
    supportsStreaming: true,
    sessionTitleStrategy: "native",
    transport: "acp",
  },
};

const forkAndResume: InitializeResponse = {
  protocolVersion: 1,
  agentCapabilities: { sessionCapabilities: { fork: {}, resume: {} } },
  agentInfo: { name: "example", version: "2.0.0" },
};

function payload(
  overrides: Partial<ForkProviderSessionPayload> = {},
): ForkProviderSessionPayload {
  return {
    source: {
      sessionId: "source",
      providerSessionId: "acp-source",
      providerStateJson: "{}",
      providerVersion: "1.0.0",
      resumable: true,
      updatedAt: "2026-10-14T00:00:00.000Z",
    },
    targetSessionId: "fork",
    workspaceRootPath: "/workspace",
    userTurnCount: null,
    ...overrides,
  };
}

function setup(initialized: InitializeResponse) {
  const forkSession = vi.fn(async (_request: ForkSessionRequest) => ({
    sessionId: "acp-fork",
  }));
  const close = vi.fn(async () => {});
  const spawn = vi.fn();
  const connection = {
    initialize: async () => initialized,
    authenticate: async () => ({}),
    forkSession,
    close,
  } as unknown as AcpConnection;
  const adapter = new AcpAgentAdapter(
    { args: ["acp"], command: "example", descriptor },
    async (options) => {
      spawn(options.cwd);
      return connection;
    },
  );
  return { adapter, close, forkSession, spawn };
}

describe("AcpAgentAdapter forkProviderSession", () => {
  it("forks the whole session through session/fork", async () => {
    const { adapter, close, forkSession } = setup(forkAndResume);
    const record = await adapter.forkProviderSession(payload());
    expect(forkSession).toHaveBeenCalledWith({
      sessionId: "acp-source",
      cwd: "/workspace",
      mcpServers: [],
    });
    expect(record).toMatchObject({
      sessionId: "fork",
      providerSessionId: "acp-fork",
      providerVersion: "2.0.0",
      resumable: true,
    });
    expect(close).toHaveBeenCalled();
  });

  it("leaves a fork from an earlier turn to the context handoff", async () => {
    const { adapter, spawn } = setup(forkAndResume);
    expect(
      await adapter.forkProviderSession(payload({ userTurnCount: 1 })),
    ).toBeNull();
    expect(spawn).not.toHaveBeenCalled();
  });

  it("declines when the agent does not advertise session/fork", async () => {
    const { adapter, close, forkSession } = setup({
      protocolVersion: 1,
      agentCapabilities: { sessionCapabilities: { resume: {} } },
    });
    expect(await adapter.forkProviderSession(payload())).toBeNull();
    expect(forkSession).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });

  it("declines when the fork could not be reopened later", async () => {
    const { adapter, forkSession } = setup({
      protocolVersion: 1,
      agentCapabilities: { sessionCapabilities: { fork: {} } },
    });
    expect(await adapter.forkProviderSession(payload())).toBeNull();
    expect(forkSession).not.toHaveBeenCalled();
  });
});
