import {
  createOpencodeAdapter,
  deleteOpenCodeSession,
} from "@cocurdex/agent-adapters/internal/opencode/opencode-adapter";
import type {
  AgentEvent,
  AgentMcpServer,
  AgentPermissionRequestPayload,
  AgentPermissionResolution,
  AgentProviderSessionRecord,
  AgentQuestionRequestPayload,
  MessageRecord,
  SessionRecord,
} from "@cocurdex/shared";
import type { OpenCodeEvent } from "@opencode/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMocks = vi.hoisted(() => ({ connect: vi.fn() }));

vi.mock(
  "@cocurdex/agent-adapters/internal/opencode/opencode-runtime",
  async () => {
    const actual = await vi.importActual<
      typeof import("@cocurdex/agent-adapters/internal/opencode/opencode-runtime")
    >("@cocurdex/agent-adapters/internal/opencode/opencode-runtime");
    return {
      ...actual,
      connectOpenCode: runtimeMocks.connect,
      logOpenCode: vi.fn(),
    };
  },
);

const NATIVE_MODEL = {
  providerID: "native-provider",
  id: "native-provider/native-model",
};

function notFound() {
  return Object.assign(new Error("Session not found"), {
    name: "SessionNotFoundError",
  });
}

let sequence = 0;

function event(type: string, data: Record<string, unknown>): OpenCodeEvent {
  sequence += 1;
  return {
    id: `evt_${sequence}`,
    created: 1_790_000_000_000 + sequence,
    type,
    data,
  } as unknown as OpenCodeEvent;
}

function createEventHub() {
  const subscribers = new Set<(event: OpenCodeEvent | null) => void>();

  function subscribe(options?: { signal?: AbortSignal }) {
    const queued: Array<OpenCodeEvent | null> = [
      { type: "server.connected", data: {} } as unknown as OpenCodeEvent,
    ];
    let pending: ((value: OpenCodeEvent | null) => void) | null = null;
    const push = (value: OpenCodeEvent | null) => {
      if (pending) {
        const resolve = pending;
        pending = null;
        resolve(value);
        return;
      }
      queued.push(value);
    };
    subscribers.add(push);
    options?.signal?.addEventListener("abort", () => push(null));
    const close = () => subscribers.delete(push);

    return {
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<OpenCodeEvent>> {
            const value =
              queued.length > 0
                ? queued.shift()
                : await new Promise<OpenCodeEvent | null>((resolve) => {
                    pending = resolve;
                  });
            if (!value) {
              close();
              return { done: true, value: undefined };
            }
            return { done: false, value };
          },
          async return(): Promise<IteratorResult<OpenCodeEvent>> {
            close();
            return { done: true, value: undefined };
          },
        };
      },
    };
  }

  return {
    emit(value: OpenCodeEvent) {
      for (const push of [...subscribers]) push(value);
    },
    subscribe,
  };
}

function createClient(
  options: {
    autoComplete?: boolean;
    createIds?: string[];
    getSession?: (id: string) => Promise<unknown>;
    models?: Array<{ providerID: string; id: string; enabled: boolean }>;
  } = {},
) {
  const hub = createEventHub();
  const createIds = [...(options.createIds ?? ["ses_new"])];
  const deliver = (sessionID: string, inboxID: string) =>
    hub.emit(event("session.inbox.delivered", { sessionID, inboxID }));
  const mcpServers = new Map<string, unknown>();
  const client = {
    event: { subscribe: vi.fn(hub.subscribe) },
    mcp: {
      list: vi.fn(async () => ({
        data: [...mcpServers.keys()].map((name) => ({ name })),
      })),
      add: vi.fn(async (input: { server: string; config: unknown }) => {
        mcpServers.set(input.server, input.config);
      }),
      remove: vi.fn(async (input: { server: string }) => {
        mcpServers.delete(input.server);
      }),
    },
    model: {
      list: vi.fn(async () => ({
        data: options.models ?? [
          { ...NATIVE_MODEL, enabled: true },
          { providerID: "latest-provider", id: "latest-model", enabled: true },
        ],
      })),
    },
    permission: { reply: vi.fn(async () => undefined) },
    session: {
      create: vi.fn(async () => ({ id: createIds.shift() })),
      diff: vi.fn(async () => []),
      form: {
        cancel: vi.fn(async () => undefined),
        reply: vi.fn(async () => undefined),
      },
      get: vi.fn(async ({ sessionID }: { sessionID: string }) =>
        options.getSession
          ? options.getSession(sessionID)
          : { id: sessionID, agent: "build", model: NATIVE_MODEL },
      ),
      interrupt: vi.fn(async ({ sessionID }: { sessionID: string }) => {
        hub.emit(
          event("session.execution.interrupted", {
            sessionID,
            reason: "user",
          }),
        );
        return { interrupted: true };
      }),
      prompt: vi.fn(async (input: { sessionID: string; id: string }) => {
        if (options.autoComplete !== false) {
          setTimeout(() => {
            deliver(input.sessionID, input.id);
            hub.emit(
              event("session.execution.succeeded", {
                sessionID: input.sessionID,
              }),
            );
          }, 0);
        }
        return { id: input.id };
      }),
      remove: vi.fn(async () => undefined),
      switchAgent: vi.fn(async () => undefined),
      switchModel: vi.fn(async () => undefined),
      update: vi.fn(async () => undefined),
    },
  };
  return { client, deliver, hub, mcpServers };
}

type FakeClient = ReturnType<typeof createClient>["client"];

function createSession(
  id: string,
  overrides: Partial<SessionRecord> = {},
): SessionRecord {
  return {
    id,
    workspaceId: "workspace-1",
    title: id,
    agentType: "opencode",
    status: "idle",
    writeMode: "native-write",
    sessionModeId: null,
    providerSnapshot: {
      providerId: "native-provider",
      providerName: "Native provider",
      modelId: "native-provider/native-model",
      modelName: "Native model",
      api: "openai-completions",
      baseUrl: "https://must-not-be-injected.example.com",
    },
    createdAt: "2026-09-30T00:00:00.000Z",
    updatedAt: "2026-09-30T00:00:00.000Z",
    lastMessageAt: null,
    archivedAt: null,
    ...overrides,
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
    updatedAt: "2026-09-30T00:00:00.000Z",
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
      createdAt: "2026-09-30T00:00:00.000Z",
    },
    {
      id: "message-2",
      sessionId,
      role: "assistant",
      content: "Earlier answer",
      attachments: [],
      createdAt: "2026-09-30T00:00:01.000Z",
    },
  ];
}

const activeSessions: Array<{ dispose(): void }> = [];

function startAdapter(options: {
  client: FakeClient;
  sessionId: string;
  session?: Partial<SessionRecord>;
  providerSession?: AgentProviderSessionRecord | null;
  updates?: AgentProviderSessionRecord[];
  events?: AgentEvent[];
  requestPermission?: (
    request: AgentPermissionRequestPayload,
  ) => Promise<AgentPermissionResolution>;
  requestQuestion?: (
    request: AgentQuestionRequestPayload,
  ) => Promise<string | null>;
  agentTools?: { url: string; token: string };
  mcpServers?: AgentMcpServer[];
}) {
  runtimeMocks.connect.mockResolvedValue(options.client);
  const session = createSession(options.sessionId, options.session);
  const adapterSession = createOpencodeAdapter().createSession(
    {
      session,
      workspaceRootPath: "/workspace",
      providerSession: options.providerSession,
      agentTools: options.agentTools,
      resolveMcpServers: options.mcpServers
        ? async () => options.mcpServers ?? []
        : undefined,
      onProviderSessionUpdate(update) {
        if (update) options.updates?.push(update);
      },
      requestPermission: options.requestPermission,
      requestQuestion: options.requestQuestion,
    },
    (agentEvent) => options.events?.push(agentEvent),
  );
  activeSessions.push(adapterSession);
  return adapterSession;
}

describe("createOpencodeAdapter", () => {
  beforeEach(() => {
    runtimeMocks.connect.mockReset();
  });

  afterEach(() => {
    for (const session of activeSessions.splice(0)) session.dispose();
    vi.restoreAllMocks();
  });

  it("keeps a send active until the OpenCode execution finishes", async () => {
    const { client, deliver, hub } = createClient({ autoComplete: false });
    const session = startAdapter({ client, sessionId: "app-turn" });

    let resolved = false;
    const sending = session
      .sendMessage({ content: "Start", history: [] })
      .then(() => {
        resolved = true;
      });
    await vi.waitFor(() => expect(client.session.prompt).toHaveBeenCalled());
    const prompt = client.session.prompt.mock.calls[0]?.[0];
    if (!prompt) throw new Error("Prompt was not sent");

    deliver("ses_new", prompt.id);
    await Promise.resolve();
    expect(resolved).toBe(false);

    hub.emit(event("session.execution.succeeded", { sessionID: "ses_new" }));
    await sending;
    expect(resolved).toBe(true);
  });

  it("creates and persists a native session without injecting Cocurdex provider config", async () => {
    const { client } = createClient();
    const updates: AgentProviderSessionRecord[] = [];
    const session = startAdapter({ client, sessionId: "app-create", updates });

    await session.sendMessage({ content: "Hello", history: [] });

    expect(client.session.create).toHaveBeenCalledWith({
      location: { directory: "/workspace" },
      permissions: [
        { action: "cocurdex-session-*", resource: "*", effect: "deny" },
      ],
      agent: "build",
      model: NATIVE_MODEL,
    });
    expect(client.session.prompt).toHaveBeenCalledWith({
      sessionID: "ses_new",
      id: expect.stringMatching(/^msg_[0-9a-f]{12}[0-9A-Za-z]{14}$/),
      text: "Hello",
      files: [],
      delivery: "steer",
    });
    expect(updates.map((update) => update.providerSessionId)).toEqual([
      "ses_new",
    ]);
  });

  it("gives a session its own tool server and the assigned MCP servers", async () => {
    const { client, mcpServers } = createClient();
    mcpServers.set("cocurdex-mcp-retired", { type: "local", command: ["x"] });
    const session = startAdapter({
      client,
      sessionId: "app-tools",
      agentTools: { url: "http://127.0.0.1:4000/mcp", token: "tok" },
      mcpServers: [
        {
          transport: "stdio",
          name: "fs",
          command: "npx",
          args: ["-y", "fs-server"],
          env: { ROOT: "/srv" },
        },
      ],
    });

    await session.sendMessage({ content: "Hello", history: [] });

    const names = [...mcpServers.keys()];
    const own = names.find((name) => name.startsWith("cocurdex-session-"));
    expect(own).toMatch(/^cocurdex-session-app-tools-[0-9a-f]{8}$/);
    expect(names.sort()).toEqual(["cocurdex-mcp-fs", own].sort());
    expect(mcpServers.get("cocurdex-mcp-fs")).toEqual({
      type: "local",
      command: ["npx", "-y", "fs-server"],
      environment: { ROOT: "/srv" },
    });
    expect(mcpServers.get(own ?? "")).toEqual({
      type: "remote",
      url: "http://127.0.0.1:4000/mcp",
      headers: { Authorization: "Bearer tok" },
      oauth: false,
    });
    expect(client.session.create).toHaveBeenCalledWith(
      expect.objectContaining({
        permissions: [
          { action: "cocurdex-session-*", resource: "*", effect: "deny" },
          { action: `${own}_*`, resource: "*", effect: "allow" },
        ],
      }),
    );

    await session.sendMessage({ content: "Again", history: [] });
    expect(client.mcp.add).toHaveBeenCalledTimes(2);

    session.dispose();
    await vi.waitFor(() => expect(mcpServers.has(own ?? "")).toBe(false));
    expect(mcpServers.has("cocurdex-mcp-fs")).toBe(true);
  });

  it("re-adds servers the OpenCode service lost", async () => {
    const { client, mcpServers } = createClient();
    const session = startAdapter({
      client,
      sessionId: "app-restart",
      mcpServers: [
        {
          transport: "http",
          name: "docs",
          url: "https://docs.example.invalid/mcp",
          headers: {},
        },
      ],
    });
    await session.sendMessage({ content: "Hello", history: [] });
    mcpServers.clear();
    await session.sendMessage({ content: "Again", history: [] });
    expect(mcpServers.get("cocurdex-mcp-docs")).toEqual({
      type: "remote",
      url: "https://docs.example.invalid/mcp",
    });
  });

  it("scopes tool rules on a resumed session without dropping its own rules", async () => {
    const { client } = createClient({
      getSession: async (id) => ({
        id,
        agent: "build",
        model: NATIVE_MODEL,
        permissions: [
          { action: "bash", resource: "*", effect: "ask" },
          { action: "cocurdex-session-*", resource: "*", effect: "deny" },
        ],
      }),
    });
    const session = startAdapter({
      client,
      sessionId: "app-resumed",
      agentTools: { url: "http://127.0.0.1:4000/mcp", token: "tok" },
      providerSession: providerSession("app-resumed", "ses_saved"),
    });

    await session.sendMessage({ content: "Hello", history: [] });
    await session.sendMessage({ content: "Again", history: [] });

    expect(client.session.update).toHaveBeenCalledOnce();
    expect(client.session.update).toHaveBeenCalledWith({
      sessionID: "ses_saved",
      permissions: [
        { action: "bash", resource: "*", effect: "ask" },
        { action: "cocurdex-session-*", resource: "*", effect: "deny" },
        {
          action: expect.stringMatching(
            /^cocurdex-session-app-resumed-[0-9a-f]{8}_\*$/,
          ),
          resource: "*",
          effect: "allow",
        },
      ],
    });
  });

  it("uses the prompt id as the turn boundary for native diffs", async () => {
    const { client } = createClient();
    const session = startAdapter({ client, sessionId: "app-diff" });

    await session.sendMessage({ content: "Edit", history: [] });
    await session.collectNativeWorkspaceChanges?.({
      providerTurnId: null,
      userMessageId: "message-1",
    });

    const promptId = client.session.prompt.mock.calls[0]?.[0].id;
    expect(client.session.diff).toHaveBeenCalledWith({
      sessionID: "ses_new",
      from: promptId,
    });
  });

  it("resumes the saved native session without replaying history", async () => {
    const { client } = createClient();
    const session = startAdapter({
      client,
      sessionId: "app-resume",
      providerSession: providerSession("app-resume", "ses_saved"),
    });

    await session.sendMessage({
      content: "Continue",
      history: history("app-resume"),
    });

    expect(client.session.get).toHaveBeenCalledWith({ sessionID: "ses_saved" });
    expect(client.session.create).not.toHaveBeenCalled();
    expect(client.session.switchModel).not.toHaveBeenCalled();
    expect(client.session.prompt).toHaveBeenCalledWith(
      expect.objectContaining({ sessionID: "ses_saved", text: "Continue" }),
    );
  });

  it("creates a fresh native session when the saved session was deleted", async () => {
    const { client } = createClient({
      getSession: () => Promise.reject(notFound()),
    });
    const session = startAdapter({
      client,
      sessionId: "app-deleted",
      providerSession: providerSession("app-deleted", "ses_gone"),
    });

    await session.sendMessage({ content: "Again", history: [] });

    expect(client.session.create).toHaveBeenCalledOnce();
    expect(client.session.prompt).toHaveBeenCalledWith(
      expect.objectContaining({ sessionID: "ses_new" }),
    );
  });

  it("fails before sending when the saved native session cannot be verified", async () => {
    const { client } = createClient({
      getSession: () => Promise.reject(new Error("database is locked")),
    });
    const events: AgentEvent[] = [];
    const session = startAdapter({
      client,
      events,
      sessionId: "app-invalid",
      providerSession: providerSession("app-invalid", "ses_saved"),
    });

    await session.sendMessage({ content: "Continue", history: [] });

    expect(client.session.prompt).not.toHaveBeenCalled();
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "error",
        message: expect.stringContaining(
          "could not restore its native session",
        ),
      }),
    );
  });

  it("does not create a native session when existing history has no mapping", async () => {
    const { client } = createClient();
    const events: AgentEvent[] = [];
    const session = startAdapter({ client, events, sessionId: "app-orphan" });

    await session.sendMessage({
      content: "Continue",
      history: history("app-orphan"),
    });

    expect(client.session.create).not.toHaveBeenCalled();
    expect(events.at(-1)).toMatchObject({ status: "error" });
  });

  it("switches the native model and agent when the selection changes", async () => {
    const { client } = createClient();
    const session = startAdapter({
      client,
      sessionId: "app-switch",
      session: { sessionModeId: "plan" },
      providerSession: providerSession("app-switch", "ses_saved"),
    });

    await session.sendMessage({
      content: "Plan it",
      history: [],
      providerSnapshot: {
        providerId: "latest-provider",
        providerName: "Latest provider",
        modelId: "latest-model",
        modelName: "Latest model",
        api: "openai-completions",
        baseUrl: "",
        openCodeVariant: "high",
      },
    });

    expect(client.session.switchAgent).toHaveBeenCalledWith({
      sessionID: "ses_saved",
      agent: "plan",
    });
    expect(client.session.switchModel).toHaveBeenCalledWith({
      sessionID: "ses_saved",
      model: {
        providerID: "latest-provider",
        id: "latest-model",
        variant: "high",
      },
    });
  });

  it("rejects a model removed from the live OpenCode catalog before sending", async () => {
    const { client } = createClient({
      models: [{ providerID: "other", id: "other-model", enabled: true }],
    });
    const events: AgentEvent[] = [];
    const session = startAdapter({ client, events, sessionId: "app-model" });

    await session.sendMessage({ content: "Hello", history: [] });

    expect(client.session.prompt).not.toHaveBeenCalled();
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "error",
        message: expect.stringContaining("is no longer available"),
      }),
    );
  });

  it("answers permissions through the daemon unless a native mode decides", async () => {
    const { client, deliver, hub } = createClient({ autoComplete: false });
    const requestPermission = vi.fn(async () => ({
      decision: "allow_always" as const,
      optionId: null,
    }));
    const session = startAdapter({
      client,
      requestPermission,
      sessionId: "app-permission",
    });

    const sending = session.sendMessage({ content: "Edit", history: [] });
    await vi.waitFor(() => expect(client.session.prompt).toHaveBeenCalled());
    deliver("ses_new", client.session.prompt.mock.calls[0]?.[0].id ?? "");
    hub.emit(
      event("permission.asked", {
        id: "per_1",
        sessionID: "ses_new",
        action: "edit",
        resources: ["src/a.ts"],
        metadata: { files: [{ file: "src/a.ts" }] },
      }),
    );
    await vi.waitFor(() =>
      expect(client.permission.reply).toHaveBeenCalledWith({
        sessionID: "ses_new",
        requestID: "per_1",
        decision: "always",
      }),
    );
    expect(requestPermission).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "edit",
        locations: [{ path: "src/a.ts" }],
      }),
    );

    hub.emit(event("session.execution.succeeded", { sessionID: "ses_new" }));
    await sending;

    const denying = session.sendMessage({
      content: "Edit again",
      history: [],
      permissionMode: "opencode-deny",
    });
    await vi.waitFor(() =>
      expect(client.session.prompt).toHaveBeenCalledTimes(2),
    );
    deliver("ses_new", client.session.prompt.mock.calls[1]?.[0].id ?? "");
    hub.emit(
      event("permission.asked", {
        id: "per_2",
        sessionID: "ses_new",
        action: "bash",
        resources: ["rm -rf build"],
      }),
    );
    await vi.waitFor(() =>
      expect(client.permission.reply).toHaveBeenLastCalledWith({
        sessionID: "ses_new",
        requestID: "per_2",
        decision: "reject",
      }),
    );
    expect(requestPermission).toHaveBeenCalledOnce();
    hub.emit(event("session.execution.succeeded", { sessionID: "ses_new" }));
    await denying;
  });

  it("answers OpenCode question forms through the daemon question callback", async () => {
    const { client, deliver, hub } = createClient({ autoComplete: false });
    const requestQuestion = vi.fn(async () => "Beta, Gamma");
    const session = startAdapter({
      client,
      requestQuestion,
      sessionId: "app-question",
    });

    const sending = session.sendMessage({ content: "Ask me", history: [] });
    await vi.waitFor(() => expect(client.session.prompt).toHaveBeenCalled());
    deliver("ses_new", client.session.prompt.mock.calls[0]?.[0].id ?? "");
    hub.emit(
      event("form.created", {
        form: {
          id: "frm_1",
          sessionID: "ses_new",
          title: "Questions",
          metadata: { kind: "question" },
          fields: [
            {
              key: "q0",
              type: "multiselect",
              title: "Pick",
              description: "Which ones?",
              options: [
                { value: "Beta", label: "Beta", description: "B" },
                { value: "Gamma", label: "Gamma" },
              ],
            },
          ],
        },
      }),
    );

    await vi.waitFor(() =>
      expect(client.session.form.reply).toHaveBeenCalledWith({
        sessionID: "ses_new",
        formID: "frm_1",
        answer: { q0: ["Beta", "Gamma"] },
      }),
    );
    expect(requestQuestion).toHaveBeenCalledWith({
      id: "frm_1:0",
      sessionId: "app-question",
      providerId: "opencode",
      question: "Which ones?",
      header: "Pick",
      options: [
        { label: "Beta", description: "B" },
        { label: "Gamma", description: "" },
      ],
      multiSelect: true,
    });
    hub.emit(event("session.execution.succeeded", { sessionID: "ses_new" }));
    await sending;
  });

  it("interrupts a running execution when stopped", async () => {
    const { client, deliver } = createClient({ autoComplete: false });
    const events: AgentEvent[] = [];
    const session = startAdapter({ client, events, sessionId: "app-stop" });

    const sending = session.sendMessage({ content: "Long task", history: [] });
    await vi.waitFor(() => expect(client.session.prompt).toHaveBeenCalled());
    deliver("ses_new", client.session.prompt.mock.calls[0]?.[0].id ?? "");
    await Promise.resolve();

    await session.stop();
    await sending;

    expect(client.session.interrupt).toHaveBeenCalledWith({
      sessionID: "ses_new",
    });
    expect(events.filter((agentEvent) => agentEvent.type === "error")).toEqual(
      [],
    );
    expect(events.at(-1)).toMatchObject({ status: "idle" });
  });

  it("stops a turn whose prompt was never delivered", async () => {
    const { client } = createClient({ autoComplete: false });
    client.session.interrupt.mockResolvedValue({ interrupted: false });
    const events: AgentEvent[] = [];
    const session = startAdapter({
      client,
      events,
      sessionId: "app-stop-early",
    });

    const sending = session.sendMessage({ content: "Queued", history: [] });
    await vi.waitFor(() => expect(client.session.prompt).toHaveBeenCalled());

    await session.stop();
    await sending;

    expect(events.at(-1)).toMatchObject({ status: "idle" });
  });

  it("does not let concurrent Cocurdex sessions claim the same native session", async () => {
    const { client } = createClient();
    const first = startAdapter({
      client,
      sessionId: "app-first",
      providerSession: providerSession("app-first", "ses_shared"),
    });
    await first.sendMessage({ content: "One", history: [] });

    const events: AgentEvent[] = [];
    const second = startAdapter({
      client,
      events,
      sessionId: "app-second",
      providerSession: providerSession("app-second", "ses_shared"),
    });
    await second.sendMessage({ content: "Two", history: [] });

    expect(client.session.prompt).toHaveBeenCalledOnce();
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "error",
        message: expect.stringContaining(
          "could not restore its native session",
        ),
      }),
    );
  });

  it("removes a native session created while its runtime is being disposed", async () => {
    const { client } = createClient();
    let releaseCreate: (value: { id: string }) => void = () => {};
    client.session.create.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseCreate = resolve;
        }),
    );
    const session = startAdapter({ client, sessionId: "app-dispose" });

    const sending = session.sendMessage({ content: "Hello", history: [] });
    await vi.waitFor(() => expect(client.session.create).toHaveBeenCalled());
    session.dispose();
    releaseCreate({ id: "ses_orphan" });
    await sending;

    expect(client.session.remove).toHaveBeenCalledWith({
      sessionID: "ses_orphan",
    });
    expect(client.session.prompt).not.toHaveBeenCalled();
  });
});

describe("deleteOpenCodeSession", () => {
  it("deletes the native session and tolerates one that is already gone", async () => {
    const { client } = createClient();
    runtimeMocks.connect.mockResolvedValue(client);

    await deleteOpenCodeSession({ providerSessionId: "ses_old" });
    client.session.remove.mockRejectedValueOnce(notFound());
    await deleteOpenCodeSession({ providerSessionId: "ses_gone" });

    expect(client.session.remove).toHaveBeenCalledWith({
      sessionID: "ses_old",
    });
    expect(client.session.remove).toHaveBeenCalledWith({
      sessionID: "ses_gone",
    });
  });
});
