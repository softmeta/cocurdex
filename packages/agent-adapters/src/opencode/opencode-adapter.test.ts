import type {
  AgentEvent,
  AgentProviderSessionRecord,
  AgentQuestionRequestPayload,
  MessageRecord,
  SessionRecord,
} from "@cocurdex/shared";
import type { Event as OpenCodeEvent, OpencodeClient } from "@opencode-ai/sdk";
import type { OpencodeClient as OpenCodeV2Client } from "@opencode-ai/sdk/v2";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOpencodeAdapter,
  deleteOpenCodeSession,
} from "./opencode-adapter";

const runtimeMocks = vi.hoisted(() => ({
  acquire: vi.fn(),
  release: vi.fn(),
}));

vi.mock("./opencode-runtime", async () => {
  const actual =
    await vi.importActual<typeof import("./opencode-runtime")>(
      "./opencode-runtime",
    );
  return {
    ...actual,
    acquireOpenCodeRuntime: runtimeMocks.acquire,
    logOpenCode: vi.fn(),
    releaseOpenCodeRuntime: runtimeMocks.release,
  };
});

interface TestEventStream {
  close(): void;
  push(event: OpenCodeEvent): void;
  stream: AsyncIterable<OpenCodeEvent>;
}

type OpenCodeCreateResult = Awaited<
  ReturnType<OpencodeClient["session"]["create"]>
>;

function createEventStream(): TestEventStream {
  const queued: OpenCodeEvent[] = [];
  let closed = false;
  let pending:
    | ((result: IteratorResult<OpenCodeEvent, undefined>) => void)
    | null = null;

  return {
    close() {
      closed = true;
      if (pending) {
        const resolve = pending;
        pending = null;
        resolve({ done: true, value: undefined });
      }
    },
    push(event) {
      if (pending) {
        const resolve = pending;
        pending = null;
        resolve({ done: false, value: event });
        return;
      }
      queued.push(event);
    },
    stream: {
      [Symbol.asyncIterator]() {
        return {
          next() {
            if (closed) {
              return Promise.resolve({ done: true as const, value: undefined });
            }
            const event = queued.shift();
            if (event) {
              return Promise.resolve({ done: false as const, value: event });
            }
            return new Promise<IteratorResult<OpenCodeEvent, undefined>>(
              (resolve) => {
                pending = resolve;
              },
            );
          },
        };
      },
    },
  };
}

const clientV2ByRootClient = new WeakMap<OpencodeClient, OpenCodeV2Client>();

function createSession(id: string): SessionRecord {
  return {
    id,
    workspaceId: "workspace-1",
    title: id,
    agentType: "opencode",
    status: "idle",
    writeMode: "native-write",
    collaborationMode: "default",
    providerSnapshot: {
      providerId: "native-provider",
      providerName: "Native provider",
      modelId: "native-provider/native-model",
      modelName: "Native model",
      api: "openai-completions",
      baseUrl: "https://must-not-be-injected.example.com",
    },
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
    lastMessageAt: null,
    archivedAt: null,
  };
}

function providerSession(
  sessionId: string,
  providerSessionId: string,
): AgentProviderSessionRecord {
  return {
    sessionId,
    providerSessionId,
    providerStateJson: "{}",
    providerVersion: "opencode",
    resumable: true,
    updatedAt: "2026-07-18T00:00:00.000Z",
  };
}

function history(sessionId: string): MessageRecord[] {
  return [
    {
      id: "message-1",
      sessionId,
      role: "user",
      content: "Earlier question",
      attachments: [],
      createdAt: "2026-07-18T00:00:00.000Z",
    },
    {
      id: "message-2",
      sessionId,
      role: "assistant",
      content: "Earlier answer",
      attachments: [],
      createdAt: "2026-07-18T00:00:01.000Z",
    },
  ];
}

function createClient(options: {
  autoIdle?: boolean;
  createIds?: string[];
  getSession?: (id: string) => Promise<unknown>;
  providerCatalog?: {
    all: Array<{ id: string; models: Record<string, { id: string }> }>;
    connected: string[];
    default: Record<string, string>;
  };
}) {
  const eventStream = createEventStream();
  const createIds = [...(options.createIds ?? ["native-new"])];
  const client = {
    event: {
      subscribe: vi.fn(async () => ({ stream: eventStream.stream })),
    },
    session: {
      abort: vi.fn(async () => ({ data: true })),
      create: vi.fn(async () => ({ data: { id: createIds.shift() } })),
      delete: vi.fn(async () => ({ data: true, response: new Response() })),
      diff: vi.fn(async () => ({ data: [] })),
      get: vi.fn(async ({ path }: { path: { id: string } }) =>
        options.getSession
          ? options.getSession(path.id)
          : Promise.resolve({ data: { id: path.id, title: path.id } }),
      ),
      message: vi.fn(),
      messages: vi.fn(),
      promptAsync: vi.fn(async ({ sessionID }: { sessionID: string }) => {
        if (options.autoIdle !== false) {
          setTimeout(() => {
            eventStream.push({
              type: "session.idle",
              properties: { sessionID },
            } as OpenCodeEvent);
          }, 0);
        }
        return { data: true };
      }),
    },
    postSessionIdPermissionsPermissionId: vi.fn(async () => ({ data: true })),
  };
  const clientV2 = {
    provider: {
      list: vi.fn(async () => ({
        data: options.providerCatalog ?? {
          all: [
            {
              id: "native-provider",
              models: {
                "native-provider/native-model": {
                  id: "native-provider/native-model",
                },
              },
            },
            {
              id: "latest-provider",
              models: { "latest-model": { id: "latest-model" } },
            },
          ],
          connected: ["native-provider", "latest-provider"],
          default: {},
        },
      })),
    },
    session: {
      abort: client.session.abort,
      promptAsync: client.session.promptAsync,
    },
    question: {
      reject: vi.fn(async () => ({ data: true })),
      reply: vi.fn(async () => ({ data: true })),
    },
  };
  const rootClient = client as unknown as OpencodeClient;
  const v2Client = clientV2 as unknown as OpenCodeV2Client;
  clientV2ByRootClient.set(rootClient, v2Client);
  return {
    client: rootClient,
    clientV2: v2Client,
    eventStream,
  };
}

const activeSessions: Array<{ dispose(): void }> = [];

function startAdapter(options: {
  client: OpencodeClient;
  providerSession?: AgentProviderSessionRecord | null;
  sessionId: string;
  updates: AgentProviderSessionRecord[];
  events?: AgentEvent[];
  clientV2?: OpenCodeV2Client;
  requestQuestion?: (
    request: AgentQuestionRequestPayload,
  ) => Promise<string | null>;
}) {
  runtimeMocks.acquire.mockResolvedValue({
    cacheKey: "test",
    client: options.client,
    clientV2: options.clientV2 ?? clientV2ByRootClient.get(options.client),
    refCount: 1,
    server: { close: vi.fn(), url: "http://127.0.0.1:12345" },
  });
  const sessionRecord = createSession(options.sessionId);
  if (!sessionRecord.providerSnapshot) {
    throw new Error("Test session requires a provider snapshot");
  }
  const adapterSession = createOpencodeAdapter().createSession(
    {
      session: sessionRecord,
      workspaceRootPath: "/workspace",
      providerSession: options.providerSession,
      providerConfig: {
        ...sessionRecord.providerSnapshot,
        apiKey: "must-not-be-injected",
      },
      onProviderSessionUpdate(update) {
        if (update) options.updates.push(update);
      },
      requestQuestion: options.requestQuestion,
    },
    (event) => options.events?.push(event),
  );
  activeSessions.push(adapterSession);
  return adapterSession;
}

describe("createOpencodeAdapter", () => {
  beforeEach(() => {
    runtimeMocks.acquire.mockReset();
    runtimeMocks.release.mockReset();
  });

  afterEach(() => {
    for (const session of activeSessions.splice(0)) session.dispose();
    vi.restoreAllMocks();
  });

  it("keeps a normal send active until the native OpenCode turn is idle", async () => {
    const { client, eventStream } = createClient({ autoIdle: false });
    const session = startAdapter({
      client,
      sessionId: "app-turn-lifecycle",
      updates: [],
    });

    let sendResolved = false;
    const sending = session
      .sendMessage({ content: "Start", history: [] })
      .then(() => {
        sendResolved = true;
      });

    await vi.waitFor(() =>
      expect(client.session.promptAsync).toHaveBeenCalledOnce(),
    );
    await Promise.resolve();
    expect(sendResolved).toBe(false);

    eventStream.push({
      type: "session.idle",
      properties: { sessionID: "native-new" },
    } as OpenCodeEvent);

    await sending;
    expect(sendResolved).toBe(true);
  });

  it("keeps the turn running while OpenCode is retrying", async () => {
    const { client, eventStream } = createClient({ autoIdle: false });
    const events: AgentEvent[] = [];
    const session = startAdapter({
      client,
      events,
      sessionId: "app-turn-retry",
      updates: [],
    });

    const sending = session.sendMessage({ content: "Start", history: [] });
    await vi.waitFor(() =>
      expect(client.session.promptAsync).toHaveBeenCalledOnce(),
    );
    eventStream.push({
      type: "session.status",
      properties: {
        sessionID: "native-new",
        status: { type: "retry" },
      },
    } as OpenCodeEvent);

    await vi.waitFor(() =>
      expect(events).toContainEqual(
        expect.objectContaining({ status: "running", type: "state.changed" }),
      ),
    );
    expect(events).not.toContainEqual(
      expect.objectContaining({ status: "idle", type: "state.changed" }),
    );

    eventStream.push({
      type: "session.idle",
      properties: { sessionID: "native-new" },
    } as OpenCodeEvent);
    await sending;
  });

  it("settles an active send when the OpenCode event stream ends", async () => {
    const { client, eventStream } = createClient({ autoIdle: false });
    const events: AgentEvent[] = [];
    const session = startAdapter({
      client,
      events,
      sessionId: "app-stream-ended",
      updates: [],
    });

    let sendResolved = false;
    const sending = session
      .sendMessage({ content: "Start", history: [] })
      .then(() => {
        sendResolved = true;
      });
    await vi.waitFor(() =>
      expect(client.session.promptAsync).toHaveBeenCalledOnce(),
    );

    eventStream.close();

    await vi.waitFor(() => expect(sendResolved).toBe(true));
    await sending;
    expect(events).toContainEqual(
      expect.objectContaining({ status: "error", type: "state.changed" }),
    );
  });

  it("creates and persists a native session without injecting Cocurdex provider config", async () => {
    const { client, eventStream } = createClient({ createIds: ["native-1"] });
    const updates: AgentProviderSessionRecord[] = [];
    const events: AgentEvent[] = [];
    const session = startAdapter({
      client,
      events,
      sessionId: "app-1",
      updates,
    });

    await session.sendMessage({
      content: "Use the native model",
      history: [],
    });
    await vi.waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]).toMatchObject({
      sessionId: "app-1",
      providerSessionId: "native-1",
      resumable: true,
    });
    expect(runtimeMocks.acquire).toHaveBeenCalledWith();
    expect(client.session.create).toHaveBeenCalledWith({
      query: { directory: "/workspace" },
    });

    await vi.waitFor(() =>
      expect(client.session.promptAsync).toHaveBeenCalledOnce(),
    );
    expect(
      vi.mocked(client.session.promptAsync).mock.calls[0]?.[0],
    ).toMatchObject({
      messageID: expect.any(String),
      sessionID: "native-1",
      model: {
        providerID: "native-provider",
        modelID: "native-provider/native-model",
      },
    });

    eventStream.push({
      type: "session.updated",
      properties: {
        info: { id: "native-1", title: "Native OpenCode title" },
      },
    } as OpenCodeEvent);
    await vi.waitFor(() =>
      expect(events).toContainEqual(
        expect.objectContaining({
          type: "session.title.updated",
          sessionId: "app-1",
          title: "Native OpenCode title",
          expectedTitle: "app-1",
        }),
      ),
    );
  });

  it("ignores a delayed provider user message from the previous turn", async () => {
    const { client, eventStream } = createClient({ createIds: ["native-1"] });
    const session = startAdapter({
      client,
      sessionId: "app-1",
      updates: [],
    });

    await session.sendMessage({ content: "first", history: [] });
    await vi.waitFor(() =>
      expect(client.session.promptAsync).toHaveBeenCalledTimes(1),
    );
    const firstRequest = vi.mocked(client.session.promptAsync).mock
      .calls[0]?.[0] as unknown as { messageID?: string };
    const firstProviderMessageId = firstRequest?.messageID;
    await session.sendMessage({ content: "second", history: [] });
    await vi.waitFor(() =>
      expect(client.session.promptAsync).toHaveBeenCalledTimes(2),
    );
    const secondRequest = vi.mocked(client.session.promptAsync).mock
      .calls[1]?.[0] as unknown as { messageID?: string };
    const secondProviderMessageId = secondRequest?.messageID;
    expect(firstProviderMessageId).not.toBe(secondProviderMessageId);

    eventStream.push({
      type: "message.updated",
      properties: {
        info: { id: firstProviderMessageId, role: "user" },
      },
    } as OpenCodeEvent);
    await session.collectNativeWorkspaceChanges?.({
      userMessageId: "app-user-2",
    });

    expect(client.session.diff).toHaveBeenLastCalledWith({
      path: { id: "native-1" },
      query: {
        directory: "/workspace",
        messageID: secondProviderMessageId,
      },
    });
  });

  it("uses an OpenCode-native message identifier for prompt and diff", async () => {
    const { client } = createClient({ createIds: ["native-1"] });
    const session = startAdapter({
      client,
      sessionId: "app-native-message-id",
      updates: [],
    });

    await session.sendMessage({ content: "hello", history: [] });
    await vi.waitFor(() =>
      expect(client.session.promptAsync).toHaveBeenCalledOnce(),
    );
    const promptRequest = vi.mocked(client.session.promptAsync).mock
      .calls[0]?.[0] as unknown as { messageID?: string };

    expect(promptRequest.messageID).toMatch(
      /^msg_[0-9a-f]{12}[0-9A-Za-z]{14}$/,
    );

    await session.collectNativeWorkspaceChanges?.({
      userMessageId: "app-user-1",
    });
    expect(client.session.diff).toHaveBeenLastCalledWith({
      path: { id: "native-1" },
      query: {
        directory: "/workspace",
        messageID: promptRequest.messageID,
      },
    });
  });

  it("validates and resumes the saved native session without replaying SQLite history", async () => {
    const { client } = createClient({});
    const updates: AgentProviderSessionRecord[] = [];
    const session = startAdapter({
      client,
      providerSession: providerSession("app-resume", "native-existing"),
      sessionId: "app-resume",
      updates,
    });

    await session.sendMessage({
      content: "Continue",
      history: history("app-resume"),
    });
    await vi.waitFor(() =>
      expect(client.session.promptAsync).toHaveBeenCalledOnce(),
    );

    expect(client.session.get).toHaveBeenCalledWith({
      path: { id: "native-existing" },
      query: { directory: "/workspace" },
    });
    expect(client.session.create).not.toHaveBeenCalled();
    const request = vi.mocked(client.session.promptAsync).mock
      .calls[0]?.[0] as unknown as {
      parts?: Array<{ text?: string }>;
      sessionID?: string;
    };
    expect(request?.sessionID).toBe("native-existing");
    expect(request?.parts?.[0]?.text).toBe("Continue");
  });

  it("fails before sending when the saved native session is invalid", async () => {
    const { client } = createClient({
      createIds: ["native-replacement"],
      getSession: async () => ({ error: { message: "not found" } }),
    });
    const updates: AgentProviderSessionRecord[] = [];
    const events: AgentEvent[] = [];
    const session = startAdapter({
      client,
      events,
      providerSession: providerSession("app-invalid", "native-missing"),
      sessionId: "app-invalid",
      updates,
    });

    await session.sendMessage({
      content: "Continue",
      history: history("app-invalid"),
    });
    await vi.waitFor(() =>
      expect(events).toContainEqual(
        expect.objectContaining({
          type: "error",
          message: expect.stringContaining(
            "could not restore its native session",
          ),
        }),
      ),
    );

    expect(updates).toHaveLength(0);
    expect(client.session.create).not.toHaveBeenCalled();
    expect(client.session.promptAsync).not.toHaveBeenCalled();
  });

  it("creates a fresh native session when the saved session was deleted", async () => {
    const { client } = createClient({
      createIds: ["native-replacement"],
      getSession: async () => ({
        error: { message: "not found" },
        response: { status: 404 } as Response,
      }),
    });
    const updates: AgentProviderSessionRecord[] = [];
    const session = startAdapter({
      client,
      providerSession: providerSession("app-deleted", "native-missing"),
      sessionId: "app-deleted",
      updates,
    });

    await session.sendMessage({ content: "Start over", history: [] });
    await vi.waitFor(() =>
      expect(client.session.promptAsync).toHaveBeenCalledOnce(),
    );

    expect(client.session.create).toHaveBeenCalledOnce();
    expect(updates[0]?.providerSessionId).toBe("native-replacement");
  });

  it("uses the latest model snapshot and forwards OpenCode prompt options", async () => {
    const { client } = createClient({});
    const updates: AgentProviderSessionRecord[] = [];
    const baseSnapshot = createSession("app-options").providerSnapshot;
    if (!baseSnapshot) throw new Error("Test session requires a snapshot");
    const session = startAdapter({
      client,
      sessionId: "app-options",
      updates,
    });

    await session.sendMessage({
      content: "Use the selected runtime",
      history: [],
      providerSnapshot: {
        ...baseSnapshot,
        providerId: "latest-provider",
        providerName: "Latest provider",
        modelId: "latest-model",
        modelName: "Latest model",
        modelCompatJson: JSON.stringify({
          opencode: { agent: "general", variant: "high" },
        }),
      },
    });

    await vi.waitFor(() =>
      expect(client.session.promptAsync).toHaveBeenCalledOnce(),
    );
    expect(
      vi.mocked(client.session.promptAsync).mock.calls[0]?.[0],
    ).toMatchObject({
      model: {
        providerID: "latest-provider",
        modelID: "latest-model",
      },
      agent: "general",
      variant: "high",
    });
  });

  it("rejects a model removed from the live OpenCode catalog before sending", async () => {
    const { client } = createClient({
      providerCatalog: {
        all: [{ id: "native-provider", models: {} }],
        connected: ["native-provider"],
        default: {},
      },
    });
    const events: AgentEvent[] = [];
    const session = startAdapter({
      client,
      events,
      sessionId: "app-removed-model",
      updates: [],
    });

    await session.sendMessage({ content: "Start", history: [] });
    await vi.waitFor(() =>
      expect(events).toContainEqual(
        expect.objectContaining({
          type: "error",
          message: expect.stringContaining("no longer available"),
        }),
      ),
    );

    expect(client.session.create).not.toHaveBeenCalled();
    expect(client.session.promptAsync).not.toHaveBeenCalled();
  });

  it("fails the turn when an accepted prompt produces no OpenCode events", async () => {
    const watchdogs: Array<() => void> = [];
    const realSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(
      (callback, delay, ...args) => {
        if (delay === 10_000) {
          watchdogs.push(callback);
          return 1 as unknown as ReturnType<typeof setTimeout>;
        }
        return realSetTimeout(callback, delay, ...args);
      },
    );
    const { client } = createClient({ autoIdle: false });
    const events: AgentEvent[] = [];
    const session = startAdapter({
      client,
      events,
      sessionId: "app-no-events",
      updates: [],
    });

    const sending = session.sendMessage({ content: "Start", history: [] });
    await vi.waitFor(() =>
      expect(client.session.promptAsync).toHaveBeenCalledOnce(),
    );
    const watchdog = watchdogs.at(-1);
    expect(watchdog).toBeDefined();

    watchdog?.();

    await sending;

    await vi.waitFor(() =>
      expect(events).toContainEqual(
        expect.objectContaining({
          type: "error",
          message: expect.stringContaining("did not respond"),
        }),
      ),
    );
    expect(client.session.abort).toHaveBeenCalledOnce();
  });

  it("uses the latest permission mode for an existing OpenCode session", async () => {
    const { client, eventStream } = createClient({});
    const session = startAdapter({
      client,
      sessionId: "app-permissions",
      updates: [],
    });

    await session.sendMessage({
      content: "Start",
      history: [],
      permissionMode: "opencode-deny",
    });
    await vi.waitFor(() =>
      expect(client.session.promptAsync).toHaveBeenCalledOnce(),
    );

    eventStream.push({
      type: "permission.updated",
      properties: {
        id: "permission-1",
        sessionID: "native-new",
        messageID: "message-1",
        type: "file",
        title: "Read file",
        metadata: { path: "/workspace/file.txt" },
        time: { created: Date.now() },
      },
    } as unknown as OpenCodeEvent);

    await vi.waitFor(() =>
      expect(client.postSessionIdPermissionsPermissionId).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: "native-new", permissionID: "permission-1" },
          body: { response: "reject" },
        }),
      ),
    );
  });

  it("answers OpenCode question requests through the daemon question callback", async () => {
    const { client, clientV2, eventStream } = createClient({});
    const requestQuestion = vi.fn(async () => "Keep the existing API");
    const session = startAdapter({
      client,
      clientV2,
      requestQuestion,
      sessionId: "app-question",
      updates: [],
    });

    await session.sendMessage({ content: "Start", history: [] });
    await vi.waitFor(() =>
      expect(client.session.promptAsync).toHaveBeenCalledOnce(),
    );
    eventStream.push({
      type: "question.asked",
      properties: {
        id: "question-1",
        sessionID: "native-new",
        questions: [
          {
            header: "Migration",
            question: "Which approach should I use?",
            options: [
              { label: "Keep the existing API", description: "No migration" },
            ],
          },
        ],
      },
    } as unknown as OpenCodeEvent);

    await vi.waitFor(() => expect(requestQuestion).toHaveBeenCalledOnce());
    await vi.waitFor(() =>
      expect(vi.mocked(clientV2.question.reply)).toHaveBeenCalledWith({
        requestID: "question-1",
        directory: "/workspace",
        answers: [["Keep the existing API"]],
      }),
    );
  });

  it("waits for the OpenCode abort request before stop resolves", async () => {
    const { client } = createClient({ autoIdle: false });
    type AbortResult = { error?: unknown; response?: Response };
    let resolveAbort: (result: AbortResult) => void = () => {
      throw new Error("Abort resolver was not initialized");
    };
    const abortResult = new Promise<AbortResult>((resolve) => {
      resolveAbort = resolve;
    });
    vi.mocked(client.session.abort).mockImplementationOnce(
      () => abortResult as ReturnType<typeof client.session.abort>,
    );
    const session = startAdapter({
      client,
      sessionId: "app-stop",
      updates: [],
    });

    const sending = session.sendMessage({ content: "Start", history: [] });
    await vi.waitFor(() =>
      expect(client.session.promptAsync).toHaveBeenCalledOnce(),
    );

    let stopResolved = false;
    const stopping = Promise.resolve(session.stop()).then(() => {
      stopResolved = true;
    });
    await vi.waitFor(() => expect(client.session.abort).toHaveBeenCalledOnce());
    await Promise.resolve();
    expect(stopResolved).toBe(false);

    resolveAbort({});
    await Promise.all([sending, stopping]);
    expect(stopResolved).toBe(true);
    expect(client.session.abort).toHaveBeenCalledWith({
      sessionID: "native-new",
      directory: "/workspace",
    });
  });

  it("does not create a native session when existing history has no mapping", async () => {
    const { client } = createClient({ createIds: ["unused-session"] });
    const events: AgentEvent[] = [];
    const session = startAdapter({
      client,
      events,
      sessionId: "app-unmapped",
      updates: [],
    });

    await session.sendMessage({
      content: "Continue",
      history: history("app-unmapped"),
    });
    await vi.waitFor(() =>
      expect(events.some((event) => event.type === "error")).toBe(true),
    );

    expect(client.session.create).not.toHaveBeenCalled();
    expect(client.session.promptAsync).not.toHaveBeenCalled();
  });

  it("does not let concurrent Cocurdex sessions claim the same native session", async () => {
    const { client } = createClient({ createIds: ["native-second"] });
    const firstUpdates: AgentProviderSessionRecord[] = [];
    const secondUpdates: AgentProviderSessionRecord[] = [];
    const secondEvents: AgentEvent[] = [];
    startAdapter({
      client,
      providerSession: providerSession("app-first", "native-shared"),
      sessionId: "app-first",
      updates: firstUpdates,
    });
    await vi.waitFor(() => expect(firstUpdates).toHaveLength(1));

    const secondSession = startAdapter({
      client,
      events: secondEvents,
      providerSession: providerSession("app-second", "native-shared"),
      sessionId: "app-second",
      updates: secondUpdates,
    });
    await secondSession.sendMessage({
      content: "Continue",
      history: history("app-second"),
    });
    await vi.waitFor(() =>
      expect(secondEvents.some((event) => event.type === "error")).toBe(true),
    );

    expect(firstUpdates[0]?.providerSessionId).toBe("native-shared");
    expect(secondUpdates).toHaveLength(0);
    expect(client.session.create).not.toHaveBeenCalled();
  });

  it("persists a session ID adopted from the OpenCode event stream", async () => {
    const { client, eventStream } = createClient({
      autoIdle: false,
      createIds: ["native-main"],
    });
    const updates: AgentProviderSessionRecord[] = [];
    const session = startAdapter({
      client,
      sessionId: "app-adopt",
      updates,
    });

    const sending = session.sendMessage({ content: "Start", history: [] });
    await vi.waitFor(() => expect(updates).toHaveLength(1));
    await vi.waitFor(() =>
      expect(client.session.promptAsync).toHaveBeenCalledOnce(),
    );
    eventStream.push({
      type: "session.status",
      properties: {
        sessionID: "native-adopted",
        status: { type: "busy" },
      },
    } as OpenCodeEvent);

    await vi.waitFor(() =>
      expect(updates.at(-1)?.providerSessionId).toBe("native-adopted"),
    );
    eventStream.push({
      type: "session.idle",
      properties: { sessionID: "native-adopted" },
    } as OpenCodeEvent);
    await sending;
  });

  it("deletes a native session created while its Cocurdex runtime is being disposed", async () => {
    const { client } = createClient({});
    let resolveCreate: ((result: OpenCodeCreateResult) => void) | undefined;
    const createPromise = new Promise<OpenCodeCreateResult>((resolve) => {
      resolveCreate = resolve;
    });
    vi.mocked(client.session.create).mockReturnValueOnce(
      createPromise as ReturnType<OpencodeClient["session"]["create"]>,
    );
    const session = startAdapter({
      client,
      sessionId: "app-disposed",
      updates: [],
    });
    const sending = session.sendMessage({ content: "Start", history: [] });
    await vi.waitFor(() =>
      expect(client.session.create).toHaveBeenCalledOnce(),
    );

    session.dispose();
    resolveCreate?.({
      data: { id: "native-late" },
    } as OpenCodeCreateResult);

    await sending;

    await vi.waitFor(() =>
      expect(client.session.delete).toHaveBeenCalledWith({
        path: { id: "native-late" },
        query: { directory: "/workspace" },
      }),
    );
  });
});

describe("deleteOpenCodeSession", () => {
  it("deletes the native session through a Cocurdex-owned server process", async () => {
    runtimeMocks.acquire.mockReset();
    runtimeMocks.release.mockReset();
    const { client } = createClient({});
    runtimeMocks.acquire.mockResolvedValue({
      cacheKey: "test",
      client,
      refCount: 1,
      server: { close: vi.fn(), url: "http://127.0.0.1:12345" },
    });

    await deleteOpenCodeSession({
      providerSessionId: "native-delete",
      workspaceRootPath: "/workspace",
    });

    expect(client.session.delete).toHaveBeenCalledWith({
      path: { id: "native-delete" },
      query: { directory: "/workspace" },
    });
    expect(runtimeMocks.release).toHaveBeenCalledOnce();
  });
});
