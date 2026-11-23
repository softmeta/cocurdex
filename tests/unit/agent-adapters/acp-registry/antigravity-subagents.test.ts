import type {
  PromptResponse,
  SessionNotification,
} from "@agentclientprotocol/sdk/unstable";
import {
  AcpAgentAdapter,
  type AcpConnection,
  type AcpConnectionFactory,
} from "@cocurdex/agent-adapters/internal/acp/acp-agent-adapter";
import {
  antigravityDetachedReplies,
  normalizeAntigravityToolCall,
} from "@cocurdex/agent-adapters/internal/acp-registry/antigravity-subagents";
import type { AgentDescriptor, AgentEvent } from "@cocurdex/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const descriptor: AgentDescriptor = {
  id: "acp:antigravity-acp",
  label: "Google Antigravity",
  availability: "available",
  capabilities: {
    sessionModes: [],
    permissionModes: [],
    writeModes: ["native-write"],
    supportsSteering: false,
    supportsSelections: false,
    supportsStreaming: true,
    sessionTitleStrategy: "native",
    transport: "acp",
  },
};

const ROOT = "agy-root";

type Update = SessionNotification["update"];

function invokeSubagent(toolCallId: string, role: string): Update[] {
  const rawInput = { Prompt: `Read ${role}`, Role: role, TypeName: "research" };
  return [
    {
      sessionUpdate: "tool_call",
      toolCallId,
      title: "Run invoke_subagent",
      kind: "other",
      status: "in_progress",
      rawInput,
      name: "invoke_subagent",
    } as Update,
    {
      sessionUpdate: "tool_call_update",
      toolCallId,
      title: "Run invoke_subagent",
      status: "completed",
      rawInput,
    },
  ];
}

function reply(text: string): Update[] {
  return [
    { sessionUpdate: "agent_message_chunk", content: { type: "text", text } },
    { sessionUpdate: "usage_update", used: 100, size: 1000 },
  ];
}

function setup(promptUpdates: Update[]) {
  const events: AgentEvent[] = [];
  let handlers: Parameters<AcpConnectionFactory>[0]["handlers"] | undefined;
  const push = async (updates: Update[]) => {
    for (const update of updates) {
      await handlers?.onSessionUpdate({ sessionId: ROOT, update });
    }
  };
  const cancel = vi.fn(async () => undefined);
  const connection: AcpConnection = {
    initialize: async () => ({ protocolVersion: 1, agentCapabilities: {} }),
    authenticate: async () => ({}),
    logout: async () => ({}),
    newSession: async () => ({ sessionId: ROOT }),
    loadSession: async () => ({}),
    resumeSession: async () => ({}),
    forkSession: async () => ({ sessionId: "fork" }),
    setSessionMode: async () => ({}),
    setSessionModel: async () => ({}),
    extNotification: async () => {},
    extRequest: async () => ({}),
    setSessionConfigOption: async () => ({ configOptions: [] }),
    prompt: async (): Promise<PromptResponse> => {
      await push(promptUpdates);
      return { stopReason: "end_turn" };
    },
    cancel,
    close: () => Promise.resolve(),
  };
  const adapter = new AcpAgentAdapter(
    {
      args: ["acp"],
      command: "agy",
      descriptor,
      skipAuthenticate: true,
      contextFromUsageUpdates: true,
      detachedReplies: antigravityDetachedReplies,
      normalizeToolCall: normalizeAntigravityToolCall,
    },
    async (options) => {
      handlers = options.handlers;
      return connection;
    },
  );
  const session = adapter.createSession(
    {
      session: {
        id: "app-session",
        workspaceId: "workspace-1",
        title: "Test",
        agentType: "acp:antigravity-acp",
        status: "idle",
        writeMode: "native-write",
        sessionModeId: null,
        createdAt: "2026-11-23T00:00:00.000Z",
        updatedAt: "2026-11-23T00:00:00.000Z",
        lastMessageAt: null,
      },
      workspaceRootPath: "/workspace",
    },
    (event) => events.push(event),
  );
  const send = () => {
    let settled = false;
    const result = session
      .sendMessage({ content: "Go", attachments: [], history: [] })
      .finally(() => {
        settled = true;
      });
    return { result, isSettled: () => settled };
  };
  const completions = () =>
    events.filter(
      (event): event is Extract<AgentEvent, { type: "turn.completed" }> =>
        event.type === "turn.completed",
    );
  const completedTexts = () =>
    events.flatMap((event) =>
      event.type === "message.completed" ? [event.message.content] : [],
    );
  return { cancel, completedTexts, completions, events, push, send, session };
}

describe("Antigravity invoke_subagent turns", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the turn open until every subagent's wake reply has finished", async () => {
    const harness = setup([
      ...invokeSubagent("call-a", "File Reader A"),
      ...invokeSubagent("call-b", "File Reader B"),
      ...reply("Started both subagents; waiting."),
    ]);
    const turn = harness.send();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(turn.isSettled()).toBe(false);
    expect(harness.completions()).toHaveLength(0);

    await harness.push(reply(" B reported; still waiting on A."));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(turn.isSettled()).toBe(false);

    await harness.push(reply(" A and B both done."));
    await vi.advanceTimersByTimeAsync(3_000);
    const message = await turn.result;

    expect(harness.completions()).toEqual([
      expect.objectContaining({ stopReason: "end_turn" }),
    ]);
    expect(message.content).toBe(
      "Started both subagents; waiting. B reported; still waiting on A. A and B both done.",
    );
    expect(harness.events).toContainEqual(
      expect.objectContaining({
        type: "tool.started",
        toolCall: expect.objectContaining({ title: "File Reader A" }),
      }),
    );
  });

  it("ends a waiting turn as cancelled when the user stops it", async () => {
    const harness = setup([
      ...invokeSubagent("call-a", "File Reader A"),
      ...reply("Waiting for the subagent."),
    ]);
    const turn = harness.send();
    await vi.advanceTimersByTimeAsync(1_000);

    await harness.session.stop();
    await turn.result;

    expect(harness.cancel).toHaveBeenCalled();
    expect(harness.completions()).toEqual([
      expect.objectContaining({ stopReason: "cancelled" }),
    ]);
  });

  it("completes a wake reply that arrives after the turn has ended", async () => {
    const harness = setup(reply("Plain answer."));
    await harness.send().result;
    expect(harness.completions()).toHaveLength(1);

    await harness.push(reply("Late subagent report."));
    await vi.advanceTimersByTimeAsync(3_000);

    expect(harness.completions()).toHaveLength(2);
    expect(harness.completedTexts()).toEqual([
      "Plain answer.",
      "Late subagent report.",
    ]);
  });
});
