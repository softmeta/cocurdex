import { createServer } from "node:http";
import type { AgentRuntimeProviderConfig } from "@cocurdex/shared";
import { expect, it } from "vitest";
import { generateChatTitle, streamChat } from "./stream-chat";

it("uses the Codex OAuth protocol for chat streaming and titles", async () => {
  const token = [
    "test",
    Buffer.from(
      JSON.stringify({
        "https://api.openai.com/auth": { chatgpt_account_id: "test-account" },
      }),
    ).toString("base64url"),
    "signature",
  ].join(".");
  const requests: { url: string; authorization?: string; account?: string }[] =
    [];
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) {
    }
    requests.push({
      url: request.url ?? "",
      authorization: request.headers.authorization,
      account: request.headers["chatgpt-account-id"] as string,
    });
    response.writeHead(200, { "content-type": "text/event-stream" });
    const item = {
      id: "message",
      type: "message",
      role: "assistant",
      status: "completed",
      content: [
        { type: "output_text", text: "OAuth chat works", annotations: [] },
      ],
    };
    const events = [
      {
        type: "response.output_item.added",
        output_index: 0,
        item: { ...item, status: "in_progress", content: [] },
      },
      {
        type: "response.output_text.delta",
        output_index: 0,
        content_index: 0,
        delta: "OAuth chat works",
      },
      { type: "response.output_item.done", output_index: 0, item },
      {
        type: "response.completed",
        response: {
          id: "response",
          status: "completed",
          output: [item],
          usage: {
            input_tokens: 10,
            output_tokens: 3,
            total_tokens: 13,
            input_tokens_details: { cached_tokens: 2 },
          },
        },
      },
    ];
    for (const event of events)
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    response.end();
  });
  server.on("upgrade", (_request, socket) => {
    socket.end(
      "HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
    );
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No test address");
    const config: AgentRuntimeProviderConfig = {
      providerId: "openai-codex",
      providerName: "OpenAI Codex",
      modelId: "gpt-5.4",
      modelName: "GPT-5.4",
      api: "openai-codex-responses",
      baseUrl: `http://127.0.0.1:${address.port}/backend-api`,
      apiKey: token,
      modelCapabilities: ["chat"],
      modelMaxTokens: 1024,
      modelContextWindow: 32000,
    };
    const deltas: string[] = [];
    const result = await streamChat({
      providerConfig: config,
      messages: [
        {
          id: "user",
          conversationId: "chat",
          role: "user",
          content: [{ type: "text", text: "Hello" }],
          status: "completed",
          error: null,
          usage: null,
          sources: [],
          createdAt: "2026-09-06T00:00:00Z",
          updatedAt: "2026-09-06T00:00:00Z",
        },
      ],
      onDelta: (delta) => deltas.push(delta),
    });
    expect(result).toMatchObject({
      status: "completed",
      text: "OAuth chat works",
      usage: {
        inputTokens: 10,
        outputTokens: 3,
        totalTokens: 13,
        cacheReadInputTokens: 2,
      },
    });
    expect(deltas.join("")).toBe("OAuth chat works");
    expect(await generateChatTitle(config, "Hello")).toBe("OAuth chat works");
    expect(requests).toHaveLength(2);
    for (const request of requests)
      expect(request).toEqual({
        url: "/backend-api/codex/responses",
        authorization: `Bearer ${token}`,
        account: "test-account",
      });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}, 10_000);
