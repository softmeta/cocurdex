import type {
  Query as ClaudeQuery,
  Options as ClaudeQueryOptions,
  SDKMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type {
  AgentEvent,
  AgentProviderSessionRecord,
  AgentProviderSnapshot,
} from "@cocurdex/shared";
import { describe, expect, it, vi } from "vitest";
import { createClaudeCliAdapter } from "./claude-cli-adapter";
import {
  buildClaudeCliEnv,
  getClaudeCliPermissionMode,
} from "./claude-cli-process";
import { createClaudeRuntimeFingerprint } from "./claude-runtime";

describe("getClaudeCliPermissionMode", () => {
  it("enforces Claude plan permissions when the session is in plan mode", () => {
    expect(getClaudeCliPermissionMode("claude-default", "plan")).toBe("plan");
  });

  it("maps discovered Claude modes onto SDK values", () => {
    expect(getClaudeCliPermissionMode("claude-auto", "default", "fable")).toBe(
      "auto",
    );
    expect(getClaudeCliPermissionMode("claude-accept-edits", "default")).toBe(
      "acceptEdits",
    );
  });

  it("falls back to default permissions when Haiku is paired with auto mode", () => {
    expect(getClaudeCliPermissionMode("claude-auto", "default", "haiku")).toBe(
      "default",
    );
  });
});

describe("buildClaudeCliEnv", () => {
  it("does not expose unrelated provider credentials to Claude", () => {
    expect(
      buildClaudeCliEnv({
        ANTHROPIC_API_KEY: "anthropic-secret",
        AWS_ACCESS_KEY_ID: "bedrock-credential",
        OPENAI_API_KEY: "openai-secret",
        PATH: "/usr/bin",
      }),
    ).toEqual({
      ANTHROPIC_API_KEY: "anthropic-secret",
      AWS_ACCESS_KEY_ID: "bedrock-credential",
      PATH: "/usr/bin",
    });
  });

  it("forwards macOS session identity used by Keychain OAuth", () => {
    expect(
      buildClaudeCliEnv({
        PATH: "/usr/bin",
        XPC_SERVICE_NAME: "com.apple.finder",
        __CF_USER_TEXT_ENCODING: "0x1F5:0:0",
      }),
    ).toMatchObject({
      PATH: "/usr/bin",
      XPC_SERVICE_NAME: "com.apple.finder",
      __CF_USER_TEXT_ENCODING: "0x1F5:0:0",
    });
  });
});

describe("createClaudeCliAdapter", () => {
  it("keeps missing-runtime authentication in the official Claude CLI", async () => {
    const events: AgentEvent[] = [];
    const createQuery = vi.fn() as never;
    const session = createClaudeCliAdapter({
      createQuery,
      lookupExecutable: async () => null,
    }).createSession(createSessionPayload(), (event) => events.push(event));

    await session.sendMessage({ content: "Inspect the repo", history: [] });

    expect(createQuery).not.toHaveBeenCalled();
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "error",
        message: expect.stringContaining(
          "authenticate directly with Anthropic by running `claude` in your terminal",
        ),
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "error",
        message: expect.stringContaining(
          "Cocurdex does not receive or store your Claude credentials",
        ),
      }),
    );
  });

  it("waits for the first SDK query and generates the title through it", async () => {
    const harness = createQueryHarness();
    const createQuery = vi.fn(
      ({ prompt }: { prompt: AsyncIterable<SDKUserMessage> }) => {
        harness.promptValue(prompt);
        return harness.query;
      },
    ) as never;
    const session = createClaudeCliAdapter({
      createQuery,
      lookupExecutable: async () => "/usr/local/bin/claude",
    }).createSession(createSessionPayload(), vi.fn());
    const title = session.generateTitle?.("Inspect the repo");
    const turn = session.sendMessage({
      content: "Inspect the repo",
      history: [],
    });

    await expect(title).resolves.toBe("Review unstaged changes");
    expect(harness.generateSessionTitle).toHaveBeenCalledWith(
      "Inspect the repo",
      { persist: false },
    );
    expect(createQuery).toHaveBeenCalledOnce();

    harness.emit(createResultMessage());
    await turn;
    session.dispose();
  });

  it("starts one long-lived SDK query and persists its native cursor", async () => {
    const updates: Array<{
      providerSessionId: string;
      providerStateJson: string;
      resumable: boolean;
    }> = [];
    const events: AgentEvent[] = [];
    const harness = createQueryHarness();
    const createQuery = vi.fn(
      ({
        prompt,
        options,
      }: {
        prompt: AsyncIterable<SDKUserMessage>;
        options: ClaudeQueryOptions;
      }) => {
        harness.promptValue(prompt);
        harness.optionsValue(options);
        return harness.query;
      },
    ) as never;
    const payload = createSessionPayload((update) => {
      if (update?.providerSessionId) {
        updates.push({
          providerSessionId: update.providerSessionId,
          providerStateJson: update.providerStateJson,
          resumable: update.resumable,
        });
      }
    });
    const session = createClaudeCliAdapter({
      createQuery,
      getSessionInfo: async (providerSessionId) => ({
        sessionId: providerSessionId,
        customTitle: "Native Claude title",
        firstPrompt: "Inspect the repo",
        summary: "Inspect the repo",
        lastModified: Date.parse("2026-08-15T00:00:00.000Z"),
      }),
      lookupExecutable: async () => "/usr/local/bin/claude",
    }).createSession(payload, (event) => events.push(event));

    const turn = session.sendMessage({
      content: "Inspect the repo",
      history: [],
      thinkingLevel: "max",
    });

    await vi.waitFor(() => expect(createQuery).toHaveBeenCalledOnce());
    expect(harness.options).toMatchObject({
      additionalDirectories: ["/tmp/repo"],
      cwd: "/tmp/repo",
      effort: "max",
      enableFileCheckpointing: true,
      forwardSubagentText: true,
      includePartialMessages: true,
      pathToClaudeCodeExecutable: "/usr/local/bin/claude",
      permissionMode: "default",
      sessionId: expect.any(String),
      systemPrompt: { preset: "claude_code", type: "preset" },
    });

    const firstPrompt = (await harness.nextPrompt()).value;
    expect(firstPrompt).toMatchObject({
      message: { content: "Inspect the repo", role: "user" },
      shouldQuery: true,
    });

    harness.emit({
      event: {
        content_block_delta: undefined,
        delta: { text: "Done" },
        type: "content_block_delta",
      },
      parent_tool_use_id: null,
      session_id: "provider-session-1",
      type: "stream_event",
      uuid: "stream-1",
    });
    harness.emit({
      is_error: false,
      modelUsage: {},
      result: "Done",
      session_id: "provider-session-1",
      subtype: "success",
      total_cost_usd: 0,
      type: "result",
      usage: { input_tokens: 1, output_tokens: 1 },
      uuid: "result-1",
    });
    await turn;

    expect(createQuery).toHaveBeenCalledOnce();
    expect(updates.at(-1)).toMatchObject({
      providerSessionId: "provider-session-1",
      resumable: true,
    });
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "session.title.updated",
        sessionId: payload.session.id,
        title: "Native Claude title",
        expectedTitle: payload.session.title,
      }),
    );
    const cursor = JSON.parse(updates.at(-1)?.providerStateJson ?? "{}");
    expect(cursor).toMatchObject({
      adapter: "claude-agent-sdk",
      schemaVersion: 1,
      sessionId: "provider-session-1",
      turnCount: 1,
    });
    expect(cursor.runtimeFingerprint).toBe(
      createClaudeRuntimeFingerprint({
        configDir: null,
        executablePath: "/usr/local/bin/claude",
        workspaceRootPath: "/tmp/repo",
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "message.completed",
        sessionId: "session-1",
      }),
    );
    session.dispose();
  });

  it("emits the SDK init snapshot with MCP state", async () => {
    const events: AgentEvent[] = [];
    const harness = createQueryHarness();
    const createQuery = vi.fn(
      ({
        prompt,
        options,
      }: {
        prompt: AsyncIterable<SDKUserMessage>;
        options: ClaudeQueryOptions;
      }) => {
        harness.promptValue(prompt);
        harness.optionsValue(options);
        return harness.query;
      },
    ) as never;
    const session = createClaudeCliAdapter({
      createQuery,
      lookupExecutable: async () => "/usr/local/bin/claude",
    }).createSession(createSessionPayload(), (event) => events.push(event));

    const turn = session.sendMessage({ content: "Start", history: [] });
    await vi.waitFor(() => expect(createQuery).toHaveBeenCalledOnce());
    await harness.nextPrompt();
    harness.emit({
      apiKeySource: "oauth",
      capabilities: ["interrupt_receipt_v1"],
      claude_code_version: "2.1.220",
      cwd: "/tmp/repo",
      fast_mode_state: "off",
      mcp_servers: [
        { name: "filesystem", status: "connected" },
        { name: "github", status: "failed" },
      ],
      model: "claude-opus-4-6",
      permissionMode: "default",
      plugins: [],
      skills: ["review"],
      slash_commands: ["review"],
      subtype: "init",
      tools: ["Read", "mcp__filesystem__read_file"],
      type: "system",
      uuid: "system-1",
      session_id: "provider-session-1",
    });
    await vi.waitFor(() =>
      expect(events).toContainEqual(
        expect.objectContaining({
          type: "provider.runtime.updated",
          runtime: expect.objectContaining({
            mcpServers: [
              { name: "filesystem", status: "connected" },
              { name: "github", status: "failed" },
            ],
            runtimeVersion: "2.1.220",
            skills: ["review"],
          }),
        }),
      ),
    );
    harness.emit(createResultMessage());
    await turn;
    session.dispose();
  });

  it("uses the SDK context snapshot separately from result token usage", async () => {
    const events: AgentEvent[] = [];
    const harness = createQueryHarness();
    const getContextUsage = vi.fn(async () => ({
      maxTokens: 1_000_000,
      totalTokens: 92_000,
    }));
    harness.contextUsageGetter(getContextUsage);
    const createQuery = vi.fn(
      ({
        prompt,
        options,
      }: {
        prompt: AsyncIterable<SDKUserMessage>;
        options: ClaudeQueryOptions;
      }) => {
        harness.promptValue(prompt);
        harness.optionsValue(options);
        return harness.query;
      },
    ) as never;
    const session = createClaudeCliAdapter({
      createQuery,
      lookupExecutable: async () => "/usr/local/bin/claude",
    }).createSession(createSessionPayload(), (event) => events.push(event));

    const turn = session.sendMessage({
      content: "Inspect the repo",
      history: [],
    });
    await vi.waitFor(() => expect(createQuery).toHaveBeenCalledOnce());
    await harness.nextPrompt();
    harness.emit(createResultMessage());
    await turn;

    const usageEvents = events.filter(
      (event) => event.type === "usage.updated",
    );
    expect(getContextUsage).toHaveBeenCalledOnce();
    expect(usageEvents).toHaveLength(2);
    expect(usageEvents[0]).toMatchObject({
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    expect(usageEvents[1]).toMatchObject({
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        contextTokensUsed: 92_000,
        contextWindowSize: 1_000_000,
      },
    });
    session.dispose();
  });

  it("refreshes context usage on stream deltas and compact boundaries", async () => {
    const events: AgentEvent[] = [];
    const harness = createQueryHarness();
    let contextTokens = 40_000;
    const getContextUsage = vi.fn(async () => ({
      maxTokens: 1_000_000,
      totalTokens: contextTokens,
    }));
    harness.contextUsageGetter(getContextUsage);
    const createQuery = vi.fn(
      ({
        prompt,
        options,
      }: {
        prompt: AsyncIterable<SDKUserMessage>;
        options: ClaudeQueryOptions;
      }) => {
        harness.promptValue(prompt);
        harness.optionsValue(options);
        return harness.query;
      },
    ) as never;
    const session = createClaudeCliAdapter({
      createQuery,
      lookupExecutable: async () => "/usr/local/bin/claude",
    }).createSession(createSessionPayload(), (event) => events.push(event));

    const turn = session.sendMessage({
      content: "Inspect the repo",
      history: [],
    });
    await vi.waitFor(() => expect(createQuery).toHaveBeenCalledOnce());
    await harness.nextPrompt();

    harness.emit({
      event: { type: "message_delta", usage: { output_tokens: 5 } },
      parent_tool_use_id: null,
      session_id: "provider-session-1",
      type: "stream_event",
      uuid: "stream-delta-1",
    });
    await vi.waitFor(() => expect(getContextUsage).toHaveBeenCalledOnce());
    expect(events.at(-1)).toMatchObject({
      type: "usage.updated",
      usage: { contextTokensUsed: 40_000, contextWindowSize: 1_000_000 },
    });

    contextTokens = 42_000;
    harness.emit({
      compact_metadata: { post_tokens: 42_000 },
      session_id: "provider-session-1",
      subtype: "compact_boundary",
      type: "system",
      uuid: "compact-1",
    });
    await vi.waitFor(() => expect(getContextUsage).toHaveBeenCalledTimes(2));
    expect(events.at(-1)).toMatchObject({
      type: "usage.updated",
      usage: { contextTokensUsed: 42_000, contextWindowSize: 1_000_000 },
    });

    harness.emit(createResultMessage());
    await turn;
    expect(getContextUsage).toHaveBeenCalledTimes(3);
    session.dispose();
  });

  it("applies Claude fast mode selections", async () => {
    const harness = createQueryHarness();
    const createQuery = vi.fn(
      ({
        prompt,
        options,
      }: {
        prompt: AsyncIterable<SDKUserMessage>;
        options: ClaudeQueryOptions;
      }) => {
        harness.promptValue(prompt);
        harness.optionsValue(options);
        return harness.query;
      },
    ) as never;
    const providerSnapshot: AgentProviderSnapshot = {
      api: "anthropic-messages",
      baseUrl: "",
      fastMode: true,
      modelId: "claude-opus-4-6",
      modelName: "Claude Opus 4.6",
      providerId: "claude-agent",
      providerName: "Claude Agent",
    };
    const session = createClaudeCliAdapter({
      createQuery,
      lookupExecutable: async () => "/usr/local/bin/claude",
    }).createSession(
      createSessionPayload(undefined, undefined, providerSnapshot),
      () => undefined,
    );

    const turn = session.sendMessage({ content: "Start", history: [] });
    await vi.waitFor(() => expect(createQuery).toHaveBeenCalledOnce());
    expect(harness.options).toMatchObject({
      fastMode: true,
      model: "claude-opus-4-6",
    });
    await harness.nextPrompt();
    harness.emit(createResultMessage());
    await turn;

    const secondTurn = session.sendMessage({
      content: "Continue",
      history: [],
      providerSnapshot: {
        ...providerSnapshot,
        fastMode: false,
      },
    });
    await vi.waitFor(() =>
      expect(harness.query.applyFlagSettings).toHaveBeenCalledWith({
        effortLevel: null,
        fastMode: false,
      }),
    );
    await harness.nextPrompt();
    harness.emit(createResultMessage("result-2"));
    await secondTurn;
    session.dispose();
  });

  it("sends steer input through the existing SDK prompt stream", async () => {
    const harness = createQueryHarness();
    const createQuery = vi.fn(
      ({
        prompt,
        options,
      }: {
        prompt: AsyncIterable<SDKUserMessage>;
        options: ClaudeQueryOptions;
      }) => {
        harness.promptValue(prompt);
        harness.optionsValue(options);
        return harness.query;
      },
    ) as never;
    const session = createClaudeCliAdapter({
      createQuery,
      lookupExecutable: async () => "/usr/local/bin/claude",
    }).createSession(createSessionPayload(), () => undefined);

    const firstTurn = session.sendMessage({ content: "Start", history: [] });
    await vi.waitFor(() => expect(createQuery).toHaveBeenCalledOnce());
    await harness.nextPrompt();

    const steeredTurn = session.sendMessage({
      content: "Check the failing test first",
      delivery: "steer-active-run",
      history: [],
    });
    const steeredPrompt = (await harness.nextPrompt()).value;
    await steeredTurn;
    expect(steeredPrompt).toMatchObject({
      message: {
        content: "Check the failing test first",
        role: "user",
      },
      priority: "next",
      shouldQuery: true,
    });

    harness.emit(createResultMessage());
    await firstTurn;
    session.dispose();
  });

  it("resumes the saved SDK session and cursor without replaying app history", async () => {
    const harness = createQueryHarness();
    const createQuery = vi.fn(
      ({
        prompt,
        options,
      }: {
        prompt: AsyncIterable<SDKUserMessage>;
        options: ClaudeQueryOptions;
      }) => {
        harness.promptValue(prompt);
        harness.optionsValue(options);
        return harness.query;
      },
    ) as never;
    const session = createClaudeCliAdapter({
      createQuery,
      lookupExecutable: async () => "/usr/local/bin/claude",
    }).createSession(
      createSessionPayload(undefined, {
        sessionId: "session-1",
        providerSessionId: "provider-session-1",
        providerStateJson: JSON.stringify({
          adapter: "claude-agent-sdk",
          resumeSessionAt: "assistant-1",
          schemaVersion: 1,
          sessionId: "provider-session-1",
          turnCount: 2,
        }),
        providerVersion: "claude-agent-sdk",
        resumable: true,
        updatedAt: "2026-08-03T00:00:00.000Z",
      }),
      () => undefined,
    );

    const turn = session.sendMessage({
      content: "Continue",
      history: [
        {
          id: "user-old",
          sessionId: "session-1",
          role: "user",
          content: "Start",
          attachments: [],
          createdAt: "2026-08-03T00:00:00.000Z",
        },
      ],
    });

    await vi.waitFor(() => expect(createQuery).toHaveBeenCalledOnce());
    expect(harness.options).toMatchObject({
      resume: "provider-session-1",
      resumeSessionAt: "assistant-1",
    });
    await harness.nextPrompt();
    harness.emit(createResultMessage());
    await turn;
    session.dispose();
  });

  it("does not attribute a resume handshake result to the user turn", async () => {
    const events: AgentEvent[] = [];
    const harness = createQueryHarness();
    const createQuery = vi.fn(
      ({
        prompt,
        options,
      }: {
        prompt: AsyncIterable<SDKUserMessage>;
        options: ClaudeQueryOptions;
      }) => {
        harness.promptValue(prompt);
        harness.optionsValue(options);
        return harness.query;
      },
    ) as never;
    const session = createClaudeCliAdapter({
      createQuery,
      lookupExecutable: async () => "/usr/local/bin/claude",
    }).createSession(
      createSessionPayload(undefined, {
        sessionId: "session-1",
        providerSessionId: "provider-session-1",
        providerStateJson: JSON.stringify({
          adapter: "claude-agent-sdk",
          resumeSessionAt: "assistant-1",
          schemaVersion: 1,
          sessionId: "provider-session-1",
          turnCount: 2,
        }),
        providerVersion: "claude-agent-sdk",
        resumable: true,
        updatedAt: "2026-08-03T00:00:00.000Z",
      }),
      (event) => events.push(event),
    );

    const turn = session.sendMessage({ content: "Continue", history: [] });
    await vi.waitFor(() => expect(createQuery).toHaveBeenCalledOnce());
    await harness.nextPrompt();

    harness.emit({
      ...createResultMessage(),
      num_turns: 0,
      usage: { input_tokens: 900, output_tokens: 0 },
      uuid: "resume-result",
    });
    await vi.waitFor(() => expect(harness.query.next).toHaveBeenCalledTimes(2));

    expect(events.filter((event) => event.type === "usage.updated")).toEqual([
      expect.objectContaining({
        attribution: "session-only",
        usage: expect.objectContaining({ inputTokens: 900, outputTokens: 0 }),
      }),
    ]);
    expect(events).not.toContainEqual(
      expect.objectContaining({ type: "state.changed", status: "idle" }),
    );

    harness.emit({
      ...createResultMessage(),
      num_turns: 1,
      uuid: "turn-result",
    });
    await turn;

    expect(events.filter((event) => event.type === "usage.updated")).toEqual([
      expect.objectContaining({
        attribution: "session-only",
        usage: expect.objectContaining({ inputTokens: 900, outputTokens: 0 }),
      }),
      expect.objectContaining({
        usage: expect.objectContaining({ inputTokens: 1, outputTokens: 1 }),
      }),
    ]);
    session.dispose();
  });

  it("blocks recovery when app history exists without a native cursor", async () => {
    const createQuery = vi.fn() as never;
    const events: AgentEvent[] = [];
    const session = createClaudeCliAdapter({
      createQuery,
      lookupExecutable: async () => "/usr/local/bin/claude",
    }).createSession(createSessionPayload(), (event) => events.push(event));

    await expect(
      session.sendMessage({
        content: "Continue",
        history: [
          {
            id: "user-old",
            sessionId: "session-1",
            role: "user",
            content: "Start",
            attachments: [],
            createdAt: "2026-08-03T00:00:00.000Z",
          },
          {
            id: "assistant-old",
            sessionId: "session-1",
            role: "assistant",
            content: "Done",
            attachments: [],
            createdAt: "2026-08-03T00:00:01.000Z",
          },
        ],
      }),
    ).rejects.toThrow("could not restore its native session");

    expect(createQuery).not.toHaveBeenCalled();
    expect(events).toContainEqual(expect.objectContaining({ type: "error" }));
  });

  it("does not resume a native session under a different runtime fingerprint", async () => {
    const createQuery = vi.fn() as never;
    const previousFingerprint = createClaudeRuntimeFingerprint({
      configDir: null,
      executablePath: "/opt/old/claude",
      workspaceRootPath: "/tmp/repo",
    });
    const session = createClaudeCliAdapter({
      createQuery,
      lookupExecutable: async () => "/usr/local/bin/claude",
    }).createSession(
      createSessionPayload(undefined, {
        sessionId: "session-1",
        providerSessionId: "provider-session-1",
        providerStateJson: JSON.stringify({
          adapter: "claude-agent-sdk",
          resumeSessionAt: "assistant-1",
          runtimeFingerprint: previousFingerprint,
          sessionId: "provider-session-1",
          turnCount: 2,
        }),
        providerVersion: "claude-agent-sdk",
        resumable: true,
        updatedAt: "2026-08-03T00:00:00.000Z",
      }),
      () => undefined,
    );

    await expect(
      session.sendMessage({ content: "Continue", history: [] }),
    ).rejects.toThrow("different runtime");
    expect(createQuery).not.toHaveBeenCalled();
  });
});

function createQueryHarness() {
  const messageQueue: SDKMessage[] = [];
  const messageWaiters: Array<(result: IteratorResult<SDKMessage>) => void> =
    [];
  let closed = false;
  let prompt: AsyncIterable<SDKUserMessage> | undefined;
  let promptIterator: AsyncIterator<SDKUserMessage> | undefined;
  let options: ClaudeQueryOptions | undefined;

  const query = {
    applyFlagSettings: vi.fn(async () => undefined),
    generateSessionTitle: vi.fn(async () => "Review unstaged changes"),
    initializationResult: vi.fn(async () => ({ capabilities: [] })),
    close: vi.fn(() => {
      closed = true;
      messageWaiters.shift()?.({ done: true, value: undefined });
    }),
    interrupt: vi.fn(async () => undefined),
    next: vi.fn(async (): Promise<IteratorResult<SDKMessage>> => {
      const message = messageQueue.shift();
      if (message) {
        return { done: false, value: message };
      }
      if (closed) {
        return { done: true, value: undefined };
      }
      return new Promise((resolve) => messageWaiters.push(resolve));
    }),
    setModel: vi.fn(async () => undefined),
    setPermissionMode: vi.fn(async () => undefined),
    [Symbol.asyncIterator]() {
      return this;
    },
  } as unknown as ClaudeQuery;

  return {
    get generateSessionTitle() {
      return (
        query as unknown as {
          generateSessionTitle: ReturnType<typeof vi.fn>;
        }
      ).generateSessionTitle;
    },
    get options() {
      return options;
    },
    get prompt() {
      return prompt;
    },
    emit(message: Record<string, unknown>) {
      const resolve = messageWaiters.shift();
      if (resolve) {
        resolve({ done: false, value: message as SDKMessage });
      } else {
        messageQueue.push(message as SDKMessage);
      }
    },
    nextPrompt() {
      if (!prompt) {
        throw new Error("Claude query prompt stream has not started");
      }

      if (!promptIterator) {
        promptIterator = prompt[Symbol.asyncIterator]();
      }
      return promptIterator.next();
    },
    optionsValue(nextOptions: ClaudeQueryOptions) {
      options = nextOptions;
    },
    contextUsageGetter(getter: () => Promise<unknown>) {
      query.getContextUsage = getter as never;
    },
    promptValue(nextPrompt: AsyncIterable<SDKUserMessage>) {
      prompt = nextPrompt;
      promptIterator = nextPrompt[Symbol.asyncIterator]();
    },
    query,
  };
}

function createResultMessage(resultId = "result-1") {
  return {
    is_error: false,
    modelUsage: {},
    result: "Done",
    session_id: "provider-session-1",
    subtype: "success",
    total_cost_usd: 0,
    type: "result",
    usage: { input_tokens: 1, output_tokens: 1 },
    uuid: resultId,
  };
}

function createSessionPayload(
  onProviderSessionUpdate?: (update: AgentProviderSessionRecord | null) => void,
  providerSession?: {
    sessionId: string;
    providerSessionId: string;
    providerStateJson: string;
    providerVersion: string;
    resumable: boolean;
    updatedAt: string;
  },
  providerSnapshot?: AgentProviderSnapshot | null,
) {
  return {
    onProviderSessionUpdate,
    providerSession,
    session: {
      id: "session-1",
      workspaceId: "workspace-1",
      title: "Claude Agent session",
      agentType: "claude-agent",
      status: "idle",
      writeMode: "native-write",
      collaborationMode: "default",
      permissionMode: "claude-default",
      createdAt: "2026-07-31T00:00:00.000Z",
      updatedAt: "2026-07-31T00:00:00.000Z",
      lastMessageAt: null,
      archivedAt: null,
      providerSnapshot: providerSnapshot ?? null,
    },
    workspaceRootPath: "/tmp/repo",
  } as const;
}
