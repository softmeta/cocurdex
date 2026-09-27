import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ChatEvent } from "@cocurdex/shared";
import { expect, it, vi } from "vitest";
import { handleDaemonRequest } from "./handler";
import { CocurdexDaemonService } from "./service";

it("resolves the configured provider in the daemon, streams it, and persists the result", async () => {
  const requests: {
    url: string;
    authorization?: string;
    marker?: string;
    body: Record<string, unknown>;
  }[] = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    requests.push({
      url: request.url ?? "",
      authorization: request.headers.authorization,
      marker: request.headers["x-chat-test"] as string,
      body: JSON.parse(body),
    });
    response.writeHead(200, { "content-type": "text/event-stream" });
    const chunks = [
      {
        choices: [
          {
            index: 0,
            delta: { role: "assistant", content: "Hello " },
            finish_reason: null,
          },
        ],
      },
      {
        choices: [
          { index: 0, delta: { content: "daemon" }, finish_reason: null },
        ],
      },
      {
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 3,
          total_tokens: 15,
          prompt_tokens_details: { cached_tokens: 4 },
        },
      },
    ];
    for (const chunk of chunks)
      response.write(
        `data: ${JSON.stringify({ id: "test", object: "chat.completion.chunk", created: 1, model: "test", ...chunk })}\n\n`,
      );
    response.end("data: [DONE]\n\n");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing server address");
  const userDataPath = mkdtempSync(path.join(tmpdir(), "chat-rpc-"));
  const service = new CocurdexDaemonService({
    userDataPath,
    runtimeFingerprint: "chat-test",
  });
  try {
    const events: ChatEvent[] = [];
    service.events.on("daemon.event", (event) => {
      if ("conversationId" in event) events.push(event);
    });
    const now = new Date().toISOString();
    await service.providerService.saveProviderConfig({
      id: "custom",
      name: "Custom",
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      enabled: true,
      apiKeySecretId: null,
      headersJson: '{"X-Chat-Test":"present"}',
      createdAt: now,
      updatedAt: now,
    });
    await service.providerService.saveProviderModel({
      providerId: "custom",
      modelId: "test",
      name: "Test",
      api: "openai-completions",
      enabled: true,
      source: "manual",
      capabilities: ["chat"],
      outputLimit: 128,
      costJson: '{"input":1,"output":2,"cacheRead":0.5,"cacheWrite":1}',
      createdAt: now,
      updatedAt: now,
    });
    vi.spyOn(service.providerCredentials, "resolveSnapshot").mockImplementation(
      async (snapshot) => ({ ...snapshot, apiKey: "test-key" }),
    );
    const conversation = await handleDaemonRequest<"chat.create">(service, {
      id: "create",
      token: "test",
      method: "chat.create",
      params: { providerId: "custom", modelId: "test", title: "Integration" },
    });
    await handleDaemonRequest(service, {
      id: "send",
      token: "test",
      method: "chat.send",
      params: { conversationId: conversation.id, text: "Hello" },
    });
    await vi.waitFor(() =>
      expect(events.at(-1)?.type).toBe("conversation.message.completed"),
    );
    const snapshot = await handleDaemonRequest<"chat.get">(service, {
      id: "get",
      token: "test",
      method: "chat.get",
      params: { conversationId: conversation.id },
    });
    expect(snapshot?.messages.at(-1)).toMatchObject({
      status: "completed",
      content: [{ type: "text", text: "Hello daemon" }],
      usage: {
        inputTokens: 12,
        outputTokens: 3,
        totalTokens: 15,
        cacheReadInputTokens: 4,
        finishReason: "stop",
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      url: "/v1/chat/completions",
      authorization: "Bearer test-key",
      marker: "present",
      body: { model: "test", stream: true },
    });
    expect(snapshot?.revision).toBe(events.at(-1)?.revision);
  } finally {
    await service.shutdown();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    rmSync(userDataPath, { recursive: true, force: true });
  }
}, 15_000);
