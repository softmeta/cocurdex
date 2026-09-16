import { requestDaemon, subscribeDaemonEvents } from "@cocurdex/daemon/client";
import type {
  AgentRuntimeProviderConfig,
  ChatEvent,
  CocurdexDaemonEvent,
  ConversationMessageRecord,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  type DaemonProcess,
  spawnDaemon,
  waitFor,
} from "./helpers/daemon-process";
import { type StubLlmServer, startStubLlmServer } from "./helpers/llm-stub";

function providerConfig(stub: StubLlmServer): AgentRuntimeProviderConfig {
  return {
    providerId: "e2e-stub",
    providerName: "E2E Stub",
    modelId: "e2e-model",
    modelName: "E2E Model",
    api: "openai-completions",
    baseUrl: stub.baseUrl,
    apiKey: "e2e-key",
    modelCapabilities: ["chat"],
  };
}

async function createConversation(daemon: DaemonProcess) {
  const conversation = await requestDaemon(
    "chat.create",
    {
      providerId: "e2e-stub",
      modelId: "e2e-model",
      title: "Pinned e2e title",
    },
    daemon.options,
  );
  return conversation;
}

function chatEvents(events: CocurdexDaemonEvent[]): ChatEvent[] {
  return events.filter(
    (event): event is ChatEvent => "conversationId" in event,
  );
}

function completedAssistant(
  events: CocurdexDaemonEvent[],
): ConversationMessageRecord | undefined {
  const completed = [...chatEvents(events)]
    .reverse()
    .find((event) => event.type === "conversation.message.completed");
  return completed?.type === "conversation.message.completed"
    ? completed.message
    : undefined;
}

describe("daemon chat over a stubbed OpenAI-compatible provider", () => {
  it("streams a chat turn through the real socket and persists it", async () => {
    const stub = await startStubLlmServer();
    const daemon = await spawnDaemon();
    try {
      const events: CocurdexDaemonEvent[] = [];
      const subscription = await subscribeDaemonEvents(
        (event) => events.push(event),
        daemon.options,
      );
      const conversation = await createConversation(daemon);
      stub.plan = { kind: "stream", chunks: ["Hello", " from", " stub"] };

      const user = await requestDaemon(
        "chat.send",
        {
          message: { conversationId: conversation.id, text: "hi there" },
          providerConfig: providerConfig(stub),
        },
        daemon.options,
      );
      expect(user.role).toBe("user");
      expect(user.status).toBe("completed");

      await waitFor(() => completedAssistant(events) !== undefined);
      const assistant = completedAssistant(events);
      expect(assistant?.role).toBe("assistant");
      expect(assistant?.status).toBe("completed");
      expect(assistant?.error).toBeNull();
      expect(assistant?.content).toEqual([
        { type: "text", text: "Hello from stub" },
      ]);
      expect(assistant?.usage?.outputTokens).toBe(7);

      const snapshot = await requestDaemon(
        "chat.get",
        { conversationId: conversation.id },
        daemon.options,
      );
      expect(snapshot?.messages.map((message) => message.role)).toEqual([
        "user",
        "assistant",
      ]);

      const llmRequest = stub.requests[0];
      expect(llmRequest?.path).toBe("/v1/chat/completions");
      expect(llmRequest?.authorization).toBe("Bearer e2e-key");
      expect(llmRequest?.body.model).toBe("e2e-model");
      expect(llmRequest?.body.stream).toBe(true);
      subscription.close();
    } finally {
      await daemon.dispose();
      await stub.close();
    }
  });

  it("cancels an in-flight turn when chat.stop aborts the provider request", async () => {
    const stub = await startStubLlmServer();
    const daemon = await spawnDaemon();
    try {
      const events: CocurdexDaemonEvent[] = [];
      const subscription = await subscribeDaemonEvents(
        (event) => events.push(event),
        daemon.options,
      );
      const conversation = await createConversation(daemon);
      stub.plan = { kind: "hang" };

      await requestDaemon(
        "chat.send",
        {
          message: { conversationId: conversation.id, text: "wait" },
          providerConfig: providerConfig(stub),
        },
        daemon.options,
      );
      const llmRequest = await stub.nextRequest();
      expect(llmRequest.path).toBe("/v1/chat/completions");

      await requestDaemon(
        "chat.stop",
        { conversationId: conversation.id },
        daemon.options,
      );
      await waitFor(() => completedAssistant(events) !== undefined);
      const assistant = completedAssistant(events);
      expect(assistant?.role).toBe("assistant");
      expect(assistant?.status).toBe("cancelled");
      subscription.close();
    } finally {
      await daemon.dispose();
      await stub.close();
    }
  });

  it("records an errored assistant message when the provider fails", async () => {
    const stub = await startStubLlmServer();
    const daemon = await spawnDaemon();
    try {
      const events: CocurdexDaemonEvent[] = [];
      const subscription = await subscribeDaemonEvents(
        (event) => events.push(event),
        daemon.options,
      );
      const conversation = await createConversation(daemon);
      stub.plan = {
        kind: "fail",
        status: 500,
        message: "stubbed provider failure",
      };

      await requestDaemon(
        "chat.send",
        {
          message: { conversationId: conversation.id, text: "boom" },
          providerConfig: providerConfig(stub),
        },
        daemon.options,
      );
      await waitFor(() => completedAssistant(events) !== undefined);
      const assistant = completedAssistant(events);
      expect(assistant?.role).toBe("assistant");
      expect(assistant?.status).toBe("errored");
      expect(assistant?.error).toBeTruthy();
      subscription.close();
    } finally {
      await daemon.dispose();
      await stub.close();
    }
  });
});
