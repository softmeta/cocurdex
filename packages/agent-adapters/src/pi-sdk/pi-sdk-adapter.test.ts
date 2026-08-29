import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { AgentEvent } from "@cocurdex/shared";
import { DefaultResourceLoader } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import {
  createPiSdkAdapter,
  findPiMcpAdapterPackageJson,
  getPiMcpAdapterPath,
  resolvePiMcpAdapterPackageJson,
} from "./pi-sdk-adapter";

type RegisteredProvider = {
  providerId: string;
  config: Record<string, unknown>;
};

function createSessionPayload(
  events: AgentEvent[],
  options: {
    providerOverride?: Record<string, unknown>;
    piEvents?: Record<string, unknown>[];
    capture?: {
      createAgentSessionOptions?: Record<string, unknown>;
      createAgentSessionCalls?: number;
      resourceLoaderOptions?: Record<string, unknown>;
      provider?: RegisteredProvider;
      runtimeApiKey?: unknown[];
      setModel?: unknown;
      setThinkingLevel?: unknown;
      steer?: unknown[];
    };
  } = {},
) {
  const providerConfig = {
    providerId: "openrouter",
    providerName: "OpenRouter",
    modelId: "anthropic/claude-sonnet-4.5",
    modelName: "Claude Sonnet 4.5",
    api: "openai-completions" as const,
    baseUrl: "https://openrouter.ai/api/v1",
    headersJson: JSON.stringify({ "HTTP-Referer": "https://cocurdex.local" }),
    apiKey: "sk-test",
    ...options.providerOverride,
  };

  const adapter = createPiSdkAdapter({
    sdk: createFakeSdk(options.capture, options.piEvents),
    resolveMcpAdapterPath: () => "/tmp/node_modules/pi-mcp-adapter/index.ts",
  });

  return adapter.createSession(
    {
      session: {
        id: "session-1",
        workspaceId: "workspace-1",
        title: "Pi session",
        agentType: "pi",
        status: "idle",
        writeMode: "read-only",
        collaborationMode: "default",
        createdAt: "2026-06-10T00:00:00.000Z",
        updatedAt: "2026-06-10T00:00:00.000Z",
        lastMessageAt: null,
        archivedAt: null,
        providerSnapshot: providerConfig,
      },
      workspaceRootPath: "/tmp/repo",
      userDataPath: "/tmp/cocurdex-user-data",
      providerConfig,
      onProviderSessionUpdate: (providerSession) => {
        if (providerSession) {
          events.push({
            type: "error",
            sessionId: providerSession.sessionId,
            message: providerSession.providerStateJson,
          });
        }
      },
    },
    (event) => events.push(event),
  );
}

function createFakeSdk(
  capture?: {
    createAgentSessionOptions?: Record<string, unknown>;
    createAgentSessionCalls?: number;
    resourceLoaderOptions?: Record<string, unknown>;
    provider?: RegisteredProvider;
    runtimeApiKey?: unknown[];
    setModel?: unknown;
    setThinkingLevel?: unknown;
    steer?: unknown[];
  },
  piEvents?: Record<string, unknown>[],
) {
  let listener: ((event: Record<string, unknown>) => void) | null = null;

  class FakeAuthStorage {
    static lastPath: string | undefined;
    static create(path: string) {
      FakeAuthStorage.lastPath = path;
      return new FakeAuthStorage();
    }

    setRuntimeApiKey = vi.fn((...args: unknown[]) => {
      if (capture) {
        capture.runtimeApiKey = args;
      }
    });
  }

  class FakeDefaultResourceLoader {
    reload = vi.fn();

    constructor(options: Record<string, unknown>) {
      if (capture) {
        capture.resourceLoaderOptions = options;
      }
    }
  }

  class FakeModelRegistry {
    static lastPath: string | undefined;
    static lastProvider: unknown;
    static create(_authStorage: unknown, path: string) {
      FakeModelRegistry.lastPath = path;
      return new FakeModelRegistry();
    }

    registerProvider = vi.fn(
      (providerId: string, config: Record<string, unknown>) => {
        FakeModelRegistry.lastProvider = { providerId, config };
        if (capture) {
          capture.provider = { providerId, config };
        }
      },
    );

    find = vi.fn(() => ({ provider: "openrouter", id: "model" }));
  }

  const FakeSessionManager = {
    lastSessionDir: undefined as string | undefined,
    create(_cwd: string, sessionDir: string) {
      FakeSessionManager.lastSessionDir = sessionDir;
      return {
        getSessionFile: () => `${sessionDir}/session.jsonl`,
      };
    },

    open(_file: string, sessionDir: string) {
      FakeSessionManager.lastSessionDir = sessionDir;
      return {
        getSessionFile: () => `${sessionDir}/session.jsonl`,
      };
    },
  };

  const fakeSession = {
    sessionId: "pi-session-1",
    sessionManager: {
      getSessionFile: () => "/tmp/cocurdex-user-data/pi-agent/sessions/s.jsonl",
    },
    prompt: vi.fn(async () => {
      const script = piEvents ?? [
        {
          type: "message_update",
          assistantMessageEvent: { type: "text_delta", delta: "hello" },
        },
        { type: "agent_end", messages: [], willRetry: false },
      ];
      for (const event of script) {
        listener?.(event);
      }
    }),
    setModel: vi.fn(async (model: unknown) => {
      if (capture) {
        capture.setModel = model;
      }
    }),
    setThinkingLevel: vi.fn((level: unknown) => {
      if (capture) {
        capture.setThinkingLevel = level;
      }
    }),
    steer: vi.fn(async (...args: unknown[]) => {
      if (capture) {
        capture.steer = args;
      }
    }),
    abort: vi.fn(),
    dispose: vi.fn(),
    subscribe: vi.fn((nextListener) => {
      listener = nextListener;
      return () => {
        listener = null;
      };
    }),
  };

  return {
    AuthStorage: FakeAuthStorage,
    DefaultResourceLoader: FakeDefaultResourceLoader,
    ModelRegistry: FakeModelRegistry,
    SessionManager: FakeSessionManager,
    createAgentSession: vi.fn(async (options?: Record<string, unknown>) => {
      if (capture) {
        capture.createAgentSessionOptions = options;
        capture.createAgentSessionCalls =
          (capture.createAgentSessionCalls ?? 0) + 1;
      }
      return { session: fakeSession };
    }),
  } as never;
}

describe("createPiSdkAdapter", () => {
  it("lists skills without resolving the MCP extension", async () => {
    const adapter = createPiSdkAdapter({
      resolveMcpAdapterPath: () => {
        throw new Error("MCP extension must not load while listing skills");
      },
    });

    await expect(
      adapter.listSlashCommands?.({
        workspaceRootPath: "/tmp/cocurdex-empty-workspace",
        userDataPath: "/tmp/cocurdex-empty-user-data",
      }),
    ).resolves.toBeDefined();
  });

  it("resolves pi-mcp-adapter from packaged Electron resources", () => {
    const fixtureRoot = mkdtempSync(
      path.join(tmpdir(), "cocurdex-packaged-pi-"),
    );

    try {
      const resourcesPath = path.join(
        fixtureRoot,
        "Cocurdex.app",
        "Contents",
        "Resources",
      );
      const packageJson = path.join(
        resourcesPath,
        "app.asar",
        "node_modules",
        "pi-mcp-adapter",
        "package.json",
      );
      mkdirSync(path.dirname(packageJson), { recursive: true });
      writeFileSync(packageJson, "{}");

      expect(
        resolvePiMcpAdapterPackageJson({
          cwd: fixtureRoot,
          moduleUrl: pathToFileURL(
            path.join(resourcesPath, "cli", "daemon.cjs"),
          ).href,
          resourcesPath,
        }),
      ).toBe(packageJson);
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it("maps steer delivery to the Pi mid-turn input API", async () => {
    const events: AgentEvent[] = [];
    const capture: { steer?: unknown[] } = {};
    const session = createSessionPayload(events, { capture });

    await session.sendMessage({
      content: "Check the failing test first",
      history: [],
      delivery: "steer-active-run",
    });

    expect(capture.steer).toEqual(["Check the failing test first"]);
  });

  it("finds pi-mcp-adapter by walking up from a bundled main path", () => {
    // Electron main bundles this file into out/main/main.js — createRequire
    // from that URL cannot see workspace-only deps. The directory walk must
    // still locate packages/agent-adapters/node_modules/pi-mcp-adapter.
    const packageJson = findPiMcpAdapterPackageJson([
      path.join(process.cwd(), "apps", "desktop", "out", "main"),
    ]);
    expect(packageJson).toContain(`${path.sep}pi-mcp-adapter${path.sep}`);
    expect(packageJson?.endsWith(`${path.sep}package.json`)).toBe(true);
  });

  it("loads the published MCP extension", async () => {
    const loader = new DefaultResourceLoader({
      cwd: "/tmp/repo",
      agentDir: "/tmp/cocurdex-mcp-loader-check",
      additionalExtensionPaths: [getPiMcpAdapterPath()],
    });

    await loader.reload();

    expect(loader.getExtensions().errors).toEqual([]);
    expect(loader.getExtensions().extensions).toHaveLength(1);
  });

  it("uses Cocurdex userData for Pi auth, models, and sessions", async () => {
    const events: AgentEvent[] = [];
    const session = createSessionPayload(events);

    await session.sendMessage({ content: "hello", history: [] });

    const providerState = events.find(
      (event) =>
        event.type === "error" && event.message.includes("sessionFile"),
    );
    expect(providerState).toBeDefined();
    expect(JSON.stringify(events)).toContain(
      "/tmp/cocurdex-user-data/pi-agent",
    );
    expect(JSON.stringify(events)).not.toContain(".pi/agent");
  });

  it("fails before creating a Pi runtime when history has no native session file", async () => {
    const events: AgentEvent[] = [];
    const capture: { createAgentSessionOptions?: Record<string, unknown> } = {};
    const session = createSessionPayload(events, { capture });

    await session.sendMessage({
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
    });

    expect(capture.createAgentSessionOptions).toBeUndefined();
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "error",
        message: expect.stringContaining(
          "could not restore its native session",
        ),
      }),
    );
  });

  it("loads the MCP adapter from Cocurdex-owned Pi state", async () => {
    const events: AgentEvent[] = [];
    const capture: {
      createAgentSessionOptions?: Record<string, unknown>;
      resourceLoaderOptions?: Record<string, unknown>;
    } = {};
    const session = createSessionPayload(events, { capture });

    await session.sendMessage({ content: "hello", history: [] });

    expect(capture.resourceLoaderOptions).toMatchObject({
      cwd: "/tmp/repo",
      agentDir: "/tmp/cocurdex-user-data/pi-agent",
    });
    expect(capture.resourceLoaderOptions?.additionalExtensionPaths).toEqual([
      expect.stringContaining("pi-mcp-adapter"),
    ]);
    expect(capture.createAgentSessionOptions?.resourceLoader).toBeDefined();
    expect(process.env.PI_CODING_AGENT_DIR).toBe(
      "/tmp/cocurdex-user-data/pi-agent",
    );
  });

  it("registers Pi model with provider api and model metadata", async () => {
    const events: AgentEvent[] = [];
    const capture: { provider?: RegisteredProvider } = {};
    const session = createSessionPayload(events, {
      capture,
      providerOverride: {
        api: "anthropic-messages",
        providerCompatJson: JSON.stringify({ providerLevel: true }),
        modelCompatJson: JSON.stringify({ stream: false }),
        modelCapabilities: ["agent", "chat", "vision", "reasoning"],
        modelCostJson: JSON.stringify({ input: 3, output: 15, cacheRead: 1 }),
        modelThinkingLevelMapJson: JSON.stringify({ high: 10000 }),
        modelContextWindow: 200000,
        modelMaxTokens: 64000,
        supportsReasoning: true,
      },
    });

    await session.sendMessage({ content: "hello", history: [] });

    const config = capture.provider?.config;
    expect(config?.api).toBe("anthropic-messages");
    const model = (config?.models as Record<string, unknown>[])[0];
    expect(model.api).toBe("anthropic-messages");
    expect(model.contextWindow).toBe(200000);
    expect(model.maxTokens).toBe(64000);
    expect(model.reasoning).toBe(true);
    expect(model.input).toEqual(["text", "image"]);
    expect(model.cost).toEqual({
      input: 3,
      output: 15,
      cacheRead: 1,
      cacheWrite: 0,
    });
    expect(model.thinkingLevelMap).toEqual({ high: 10000 });
    expect(model.compat).toEqual({ stream: false });
  });

  it("injects the Cocurdex API key into Pi runtime auth for the same provider id", async () => {
    const events: AgentEvent[] = [];
    const capture: {
      provider?: RegisteredProvider;
      runtimeApiKey?: unknown[];
    } = {};
    const session = createSessionPayload(events, { capture });

    await session.sendMessage({ content: "hello", history: [] });

    expect(capture.runtimeApiKey).toEqual(["openrouter", "sk-test"]);
    expect(capture.provider?.providerId).toBe("openrouter");
    expect(capture.provider?.config.apiKey).toBe("sk-test");
  });

  it("omits image input for non-vision models", async () => {
    const events: AgentEvent[] = [];
    const capture: { provider?: RegisteredProvider } = {};
    const session = createSessionPayload(events, {
      capture,
      providerOverride: { modelCapabilities: ["agent", "chat"] },
    });

    await session.sendMessage({ content: "hello", history: [] });

    const model = (
      capture.provider?.config.models as Record<string, unknown>[]
    )[0];
    expect(model.input).toEqual(["text"]);
  });

  it("passes the selected thinking level to Pi", async () => {
    const events: AgentEvent[] = [];
    const capture: {
      createAgentSessionOptions?: Record<string, unknown>;
      setThinkingLevel?: unknown;
    } = {};
    const session = createSessionPayload(events, { capture });

    await session.sendMessage({
      content: "hello",
      history: [],
      thinkingLevel: "medium",
    });

    expect(capture.createAgentSessionOptions?.thinkingLevel).toBe("medium");
    expect(capture.setThinkingLevel).toBe("medium");
  });

  it("changes models through the existing Pi session", async () => {
    const events: AgentEvent[] = [];
    const capture: {
      createAgentSessionCalls?: number;
      setModel?: unknown;
    } = {};
    const session = createSessionPayload(events, { capture });

    await session.sendMessage({
      content: "first",
      history: [],
    });
    await session.sendMessage({
      content: "second",
      history: [],
      providerConfig: {
        providerId: "anthropic",
        providerName: "Anthropic",
        modelId: "claude-3-7-sonnet",
        modelName: "Claude 3.7 Sonnet",
        api: "anthropic-messages",
        baseUrl: "https://api.anthropic.com",
        apiKey: "sk-test-2",
      },
    });

    expect(capture.createAgentSessionCalls).toBe(1);
    expect(capture.setModel).toEqual({ provider: "openrouter", id: "model" });
  });

  it("streams Pi SDK text events into Cocurdex messages", async () => {
    const events: AgentEvent[] = [];
    const session = createSessionPayload(events);

    const message = await session.sendMessage({
      content: "hello",
      history: [],
    });

    expect(message.content).toBe("hello");
    expect(events.some((event) => event.type === "message.delta")).toBe(true);
    expect(events.some((event) => event.type === "message.completed")).toBe(
      true,
    );
  });

  it("emits Pi assistant usage as Cocurdex usage updates", async () => {
    const events: AgentEvent[] = [];
    const session = createSessionPayload(events, {
      piEvents: [
        {
          type: "message_update",
          assistantMessageEvent: { type: "text_delta", delta: "hello" },
        },
        {
          type: "message_end",
          message: {
            role: "assistant",
            usage: {
              input: 100,
              output: 25,
              cacheRead: 50,
              cacheWrite: 10,
              totalTokens: 175,
              cost: { total: 0.0123 },
            },
          },
        },
        { type: "agent_end", messages: [], willRetry: false },
      ],
    });

    await session.sendMessage({ content: "hello", history: [] });

    const usage = events.find(
      (event): event is Extract<AgentEvent, { type: "usage.updated" }> =>
        event.type === "usage.updated",
    );
    expect(usage?.usage).toEqual({
      inputTokens: 100,
      outputTokens: 25,
      cacheReadInputTokens: 50,
      cacheCreationInputTokens: 10,
      contextTokensUsed: 175,
      totalCostUsd: 0.0123,
    });
  });

  it("surfaces provider failures from assistant stopReason without throwing", async () => {
    const events: AgentEvent[] = [];
    const quotaError =
      "OpenAI API error (429): 429 You have exceeded the 5-hour usage quota.";
    const session = createSessionPayload(events, {
      piEvents: [
        {
          type: "message_end",
          message: {
            role: "assistant",
            stopReason: "error",
            errorMessage: quotaError,
            content: [],
          },
        },
        { type: "agent_end", messages: [], willRetry: false },
      ],
    });

    const message = await session.sendMessage({
      content: "hello",
      history: [],
    });

    expect(message.content).toBe("");
    expect(
      events.some(
        (event) => event.type === "error" && event.message === quotaError,
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) => event.type === "state.changed" && event.status === "error",
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) => event.type === "state.changed" && event.status === "idle",
      ),
    ).toBe(false);
  });

  it("does not keep a stopReason error after a later successful assistant turn", async () => {
    const events: AgentEvent[] = [];
    const session = createSessionPayload(events, {
      piEvents: [
        {
          type: "message_end",
          message: {
            role: "assistant",
            stopReason: "error",
            errorMessage: "transient 429",
            content: [],
          },
        },
        {
          type: "message_update",
          assistantMessageEvent: { type: "text_delta", delta: "recovered" },
        },
        {
          type: "message_end",
          message: {
            role: "assistant",
            stopReason: "stop",
            content: [{ type: "text", text: "recovered" }],
          },
        },
        { type: "agent_end", messages: [], willRetry: false },
      ],
    });

    const message = await session.sendMessage({
      content: "hello",
      history: [],
    });

    expect(message.content).toBe("recovered");
    // onProviderSessionUpdate is wired as type:"error" in the test harness;
    // assert no turn-level error event was emitted for the recovered turn.
    expect(
      events.some(
        (event) => event.type === "error" && event.message === "transient 429",
      ),
    ).toBe(false);
    expect(
      events.some(
        (event) => event.type === "state.changed" && event.status === "error",
      ),
    ).toBe(false);
    expect(
      events.some(
        (event) => event.type === "state.changed" && event.status === "idle",
      ),
    ).toBe(true);
  });

  it("completes one message per assistant turn so tool calls interleave", async () => {
    const events: AgentEvent[] = [];
    const session = createSessionPayload(events, {
      piEvents: [
        { type: "message_end", message: { role: "user" } },
        {
          type: "message_update",
          assistantMessageEvent: { type: "text_delta", delta: "turn one" },
        },
        { type: "message_end", message: { role: "assistant" } },
        {
          type: "tool_execution_start",
          toolCallId: "tool-1",
          toolName: "Read",
          args: {},
        },
        {
          type: "tool_execution_end",
          toolCallId: "tool-1",
          toolName: "Read",
          result: "ok",
        },
        {
          type: "message_update",
          assistantMessageEvent: { type: "text_delta", delta: "turn two" },
        },
        { type: "message_end", message: { role: "assistant" } },
        { type: "agent_end", messages: [], willRetry: false },
      ],
    });

    const finalMessage = await session.sendMessage({
      content: "hi",
      history: [],
    });

    const completed = events.filter(
      (event): event is Extract<AgentEvent, { type: "message.completed" }> =>
        event.type === "message.completed",
    );
    expect(completed.map((event) => event.message.content)).toEqual([
      "turn one",
      "turn two",
    ]);
    expect(new Set(completed.map((event) => event.message.id)).size).toBe(2);
    expect(finalMessage.content).toBe("turn two");

    // The turn-one message must be completed before its tool call starts,
    // and turn two must only complete after the tool call finished.
    const firstCompletedIndex = events.findIndex(
      (event) => event.type === "message.completed",
    );
    const toolStartedIndex = events.findIndex(
      (event) => event.type === "tool.started",
    );
    const toolFinishedIndex = events.findIndex(
      (event) => event.type === "tool.finished",
    );
    const secondCompletedIndex = events.reduce(
      (last, event, index) =>
        event.type === "message.completed" ? index : last,
      -1,
    );
    expect(firstCompletedIndex).toBeLessThan(toolStartedIndex);
    expect(toolFinishedIndex).toBeLessThan(secondCompletedIndex);
  });
});
