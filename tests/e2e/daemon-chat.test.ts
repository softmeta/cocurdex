import { requestDaemon, subscribeDaemonEvents } from "@cocurdex/daemon/client";
import {
  CHAT_WORKSPACE_ID,
  type CocurdexDaemonEvent,
  createProviderSnapshotForModel,
  type MessageRecord,
  type ProviderConfigRecord,
  type ProviderModelRecord,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  type DaemonProcess,
  spawnDaemon,
  waitFor,
} from "./helpers/daemon-process";
import { type StubLlmServer, startStubLlmServer } from "./helpers/llm-stub";

async function startChatSession(daemon: DaemonProcess, stub: StubLlmServer) {
  const now = new Date().toISOString();
  const provider: ProviderConfigRecord = {
    id: "e2e-stub",
    name: "E2E Stub",
    baseUrl: stub.baseUrl,
    enabled: true,
    apiKeySecretId: null,
    headersJson: JSON.stringify({ Authorization: "Bearer e2e-key" }),
    createdAt: now,
    updatedAt: now,
  };
  const model: ProviderModelRecord = {
    providerId: "e2e-stub",
    modelId: "e2e-model",
    name: "E2E Model",
    api: "openai-completions",
    enabled: true,
    source: "manual",
    capabilities: ["chat"],
    createdAt: now,
    updatedAt: now,
  };
  await requestDaemon(
    "provider.config.save",
    { config: provider },
    daemon.options,
  );
  await requestDaemon("provider.model.save", { model }, daemon.options);
  return requestDaemon(
    "session.configure",
    {
      id: crypto.randomUUID(),
      workspaceId: CHAT_WORKSPACE_ID,
      sessionKind: "chat",
      title: "Chat",
      agentType: "pi",
      writeMode: "read-only",
      sessionModeId: null,
      providerSnapshot: createProviderSnapshotForModel({ provider, model }),
    },
    daemon.options,
  );
}

function completedResponses(events: CocurdexDaemonEvent[]): MessageRecord[] {
  return events.flatMap((event) =>
    event.type === "message.completed" &&
    event.message.role === "assistant" &&
    event.message.kind === "response"
      ? [event.message]
      : [],
  );
}

function hasStatus(
  events: CocurdexDaemonEvent[],
  sessionId: string,
  status: string,
) {
  return events.some(
    (event) =>
      event.type === "state.changed" &&
      event.sessionId === sessionId &&
      event.status === status,
  );
}

function userTurns(body: Record<string, unknown>) {
  const messages = body.messages as { role: string; content: unknown }[];
  return messages
    .filter((message) => message.role === "user")
    .map((message) => JSON.stringify(message.content));
}

describe("chat sessions over a stubbed OpenAI-compatible provider", () => {
  it("answers through Pi without tools or project context", async () => {
    const stub = await startStubLlmServer();
    const daemon = await spawnDaemon();
    try {
      const events: CocurdexDaemonEvent[] = [];
      const subscription = await subscribeDaemonEvents(
        (event) => events.push(event),
        daemon.options,
      );
      const session = await startChatSession(daemon, stub);
      expect(session.sessionKind).toBe("chat");
      stub.plan = { kind: "stream", chunks: ["Hello", " from", " stub"] };

      await requestDaemon(
        "session.send",
        { sessionId: session.id, content: "hi there" },
        daemon.options,
      );

      await waitFor(() => completedResponses(events).length > 0);
      expect(completedResponses(events)[0]?.content).toBe("Hello from stub");

      const request = stub.requests[0];
      expect(request?.path).toBe("/v1/chat/completions");
      expect(request?.authorization).toBe("Bearer e2e-key");
      expect(request?.body.tools ?? []).toEqual([]);
      expect(JSON.stringify(request?.body.messages)).toContain(
        "helpful assistant",
      );

      const workspaces = await requestDaemon("workspace.list", daemon.options);
      expect(
        workspaces.find((workspace) => workspace.id === CHAT_WORKSPACE_ID)
          ?.rootPaths,
      ).toHaveLength(1);
      subscription.close();
    } finally {
      await daemon.dispose();
      await stub.close();
    }
  });

  it("replaces later turns in the model context when a message is edited", async () => {
    const stub = await startStubLlmServer();
    const daemon = await spawnDaemon();
    try {
      const events: CocurdexDaemonEvent[] = [];
      const subscription = await subscribeDaemonEvents(
        (event) => events.push(event),
        daemon.options,
      );
      const session = await startChatSession(daemon, stub);
      stub.plan = { kind: "stream", chunks: ["Answer"] };

      for (const content of ["first question", "second question"]) {
        const before = completedResponses(events).length;
        await requestDaemon(
          "session.send",
          { sessionId: session.id, content },
          daemon.options,
        );
        await waitFor(() => completedResponses(events).length > before);
        await waitFor(() => hasStatus(events, session.id, "idle"));
      }
      const { messages } = await requestDaemon(
        "session.listMessages",
        { sessionId: session.id },
        daemon.options,
      );
      const second = messages.find(
        (message) => message.content === "second question",
      );
      if (!second) throw new Error("Missing second user message");

      const before = completedResponses(events).length;
      await requestDaemon(
        "session.resubmit",
        {
          sessionId: session.id,
          messageId: second.id,
          content: "revised question",
          revertWorkspace: false,
        },
        daemon.options,
      );
      await waitFor(() => completedResponses(events).length > before);

      const edited = stub.requests.at(-1)?.body;
      if (!edited) throw new Error("Missing edited request");
      const turns = userTurns(edited);
      expect(turns.some((turn) => turn.includes("first question"))).toBe(true);
      expect(turns.some((turn) => turn.includes("revised question"))).toBe(
        true,
      );
      expect(turns.some((turn) => turn.includes("second question"))).toBe(
        false,
      );
      subscription.close();
    } finally {
      await daemon.dispose();
      await stub.close();
    }
  });

  it("stops an in-flight answer", async () => {
    const stub = await startStubLlmServer();
    const daemon = await spawnDaemon();
    try {
      const events: CocurdexDaemonEvent[] = [];
      const subscription = await subscribeDaemonEvents(
        (event) => events.push(event),
        daemon.options,
      );
      const session = await startChatSession(daemon, stub);
      stub.plan = { kind: "hang" };

      await requestDaemon(
        "session.send",
        { sessionId: session.id, content: "wait" },
        daemon.options,
      );
      await stub.nextRequest();
      await requestDaemon(
        "session.stop",
        { sessionId: session.id },
        daemon.options,
      );
      await waitFor(() => hasStatus(events, session.id, "idle"));
      subscription.close();
    } finally {
      await daemon.dispose();
      await stub.close();
    }
  });
});
