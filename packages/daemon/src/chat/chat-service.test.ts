import { createCocurdexDatabase } from "@cocurdex/db";
import type { StreamChatParams, StreamChatResult } from "@cocurdex/llm-chat";
import type { AgentRuntimeProviderConfig, ChatEvent } from "@cocurdex/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DaemonChatService } from "./chat-service";

const config: AgentRuntimeProviderConfig = {
  providerId: "custom",
  providerName: "Custom",
  modelId: "test",
  modelName: "Test",
  api: "openai-completions",
  baseUrl: "http://localhost:1/v1",
  apiKey: "test",
  modelCapabilities: ["chat"],
};
const completed: StreamChatResult = {
  text: "Answer",
  usage: { inputTokens: 3, outputTokens: 1, totalTokens: 4 },
  status: "completed",
  error: null,
};
const cleanups: (() => Promise<void>)[] = [];

function setup() {
  const db = createCocurdexDatabase(":memory:");
  const events: ChatEvent[] = [];
  const calls: {
    params: StreamChatParams;
    finish(result: StreamChatResult): void;
  }[] = [];
  const service = new DaemonChatService({
    getDatabase: async () => db,
    broadcast: (event) => events.push(event),
    generateTitle: async () => null,
    stream: (params) =>
      new Promise((resolve) => {
        calls.push({ params, finish: resolve });
        params.abortSignal?.addEventListener(
          "abort",
          () => resolve({ ...completed, text: "", status: "cancelled" }),
          { once: true },
        );
      }),
  });
  cleanups.push(async () => {
    await service.shutdown();
    db.close();
  });
  return { service, db, events, calls };
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

describe("daemon chat lifecycle", () => {
  it("reserves a conversation before asynchronous preparation and waits for cancellation to settle", async () => {
    const { service, calls, db } = setup();
    const conversation = await service.create({
      providerId: "custom",
      modelId: "test",
    });
    const first = service.send(
      { conversationId: conversation.id, text: "Hello" },
      config,
    );
    await expect(
      service.send(
        { conversationId: conversation.id, text: "Duplicate" },
        config,
      ),
    ).rejects.toThrow("already streaming");
    await first;
    calls[0].params.onDelta("Partial");
    expect(
      (await service.get(conversation.id))?.messages.at(-1)?.content,
    ).toEqual([{ type: "text", text: "Partial" }]);
    await service.stop(conversation.id);
    const messages = await db.conversationMessages.listByConversationId(
      conversation.id,
    );
    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({
      status: "cancelled",
      content: [{ type: "text", text: "Partial" }],
    });
    await service.send(
      { conversationId: conversation.id, text: "Continue" },
      config,
    );
    expect(calls).toHaveLength(2);
  });

  it("persists final content and usage and emits monotonically versioned events", async () => {
    const { service, calls, events, db } = setup();
    const conversation = await service.create({
      providerId: "custom",
      modelId: "test",
    });
    await service.send(
      { conversationId: conversation.id, text: "Hello" },
      config,
    );
    calls[0].finish(completed);
    await vi.waitFor(() =>
      expect(events.at(-1)?.type).toBe("conversation.message.completed"),
    );
    expect(
      (await db.conversationMessages.listByConversationId(conversation.id)).at(
        -1,
      ),
    ).toMatchObject({
      content: [{ type: "text", text: "Answer" }],
      status: "completed",
      usage: { totalTokens: 4 },
    });
    expect(events.map((event) => event.revision)).toEqual(
      events.map((_, i) => i + 1),
    );
    expect(new Set(events.map((event) => event.runtimeId)).size).toBe(1);
  });

  it("retries against the preceding history and edits atomically", async () => {
    const { service, calls } = setup();
    const conversation = await service.create({
      providerId: "custom",
      modelId: "test",
    });
    const user = await service.send(
      { conversationId: conversation.id, text: "First" },
      config,
    );
    await service.stop(conversation.id);
    const assistant = (await service.get(conversation.id))?.messages.at(-1);
    if (!assistant) throw new Error("Missing response");
    await service.retry(
      { conversationId: conversation.id, messageId: assistant.id },
      config,
    );
    expect(calls[1].params.messages.map((message) => message.role)).toEqual([
      "user",
    ]);
    await service.stop(conversation.id);
    await service.send(
      { conversationId: conversation.id, text: "Second" },
      config,
    );
    await service.stop(conversation.id);
    await service.edit(
      {
        conversationId: conversation.id,
        messageId: user.id,
        text: "Replacement",
      },
      config,
    );
    const snapshot = await service.get(conversation.id);
    expect(snapshot?.messages).toHaveLength(2);
    expect(snapshot?.messages[0].content).toEqual([
      { type: "text", text: "Replacement" },
    ]);
    expect(calls[3].params.messages).toHaveLength(1);
  });

  it("rejects invalid model configuration before truncating a retry", async () => {
    const { service } = setup();
    const conversation = await service.create({
      providerId: "custom",
      modelId: "test",
    });
    await service.send(
      { conversationId: conversation.id, text: "First" },
      config,
    );
    await service.stop(conversation.id);
    const before = await service.get(conversation.id);
    await expect(
      service.retry(
        {
          conversationId: conversation.id,
          messageId: before?.messages[1].id ?? "",
        },
        { ...config, headersJson: '{"X-Test":42}' },
      ),
    ).rejects.toThrow("headers");
    expect((await service.get(conversation.id))?.messages).toEqual(
      before?.messages,
    );
  });

  it("rolls back suffix deletion and metadata if a turn write fails", async () => {
    const { service, db } = setup();
    const conversation = await service.create({
      providerId: "custom",
      modelId: "test",
    });
    const user = await service.send(
      { conversationId: conversation.id, text: "First" },
      config,
    );
    await service.stop(conversation.id);
    const before = await service.get(conversation.id);
    await expect(
      db.conversations.commitTurn(
        { ...conversation, title: "Should roll back" },
        [{ ...user, conversationId: "wrong" }],
        [user.id],
      ),
    ).rejects.toThrow("another conversation");
    expect(await service.get(conversation.id)).toEqual(before);
  });

  it("deletes only after stopping active work and blocks later sends", async () => {
    const { service, events } = setup();
    const conversation = await service.create({
      providerId: "custom",
      modelId: "test",
    });
    await service.send(
      { conversationId: conversation.id, text: "First" },
      config,
    );
    await service.delete(conversation.id);
    expect(await service.get(conversation.id)).toBeNull();
    expect(events.at(-1)?.type).toBe("conversation.deleted");
    await expect(
      service.send({ conversationId: conversation.id, text: "Again" }, config),
    ).rejects.toThrow("not found");
  });

  it("shutdown cancels and persists active responses", async () => {
    const { service, db } = setup();
    const conversation = await service.create({
      providerId: "custom",
      modelId: "test",
    });
    await service.send(
      { conversationId: conversation.id, text: "First" },
      config,
    );
    await service.shutdown();
    expect(
      (await db.conversationMessages.listByConversationId(conversation.id)).at(
        -1,
      )?.status,
    ).toBe("cancelled");
    await expect(
      service.send({ conversationId: conversation.id, text: "Again" }, config),
    ).rejects.toThrow("unavailable");
  });
});
