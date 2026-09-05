import type {
  AgentRuntimeProviderConfig,
  ConversationMessageRecord,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { toChatContext } from "./chat-context";
import { resolveChatModel } from "./resolve-model";

const config: AgentRuntimeProviderConfig = {
  providerId: "custom",
  providerName: "Custom",
  modelId: "test",
  modelName: "Test",
  api: "anthropic-messages",
  baseUrl: "https://example.test/v1",
  apiKey: "key",
};

describe("Pi chat model configuration", () => {
  it("honors the declared API, per-model endpoint, headers and compatibility", () => {
    expect(
      resolveChatModel({
        ...config,
        modelBaseUrl: "https://example.test/model",
        headersJson: '{"X-Test":"value","User-Agent":null}',
        providerCompatJson: '{"supportsStore":true}',
        modelCompatJson: '{"supportsStore":false}',
        modelCapabilities: ["chat"],
        modelMaxTokens: 8192,
        modelContextWindow: 32000,
      }),
    ).toMatchObject({
      api: "anthropic-messages",
      baseUrl: "https://example.test/model",
      headers: { "X-Test": "value", "User-Agent": null },
      compat: { supportsStore: false },
      input: ["text"],
      maxTokens: 8192,
      contextWindow: 32000,
    });
  });
  it("never turns absent output limits into a one-token response", () => {
    expect(resolveChatModel(config).maxTokens).toBeGreaterThan(1);
    expect(() =>
      resolveChatModel({ ...config, headersJson: '{"bad":42}' }),
    ).toThrow("headers");
  });
  it("validates image capability and converts data URLs to Pi image blocks", () => {
    const message: ConversationMessageRecord = {
      id: "user",
      conversationId: "chat",
      role: "user",
      content: [
        {
          type: "image",
          image: "data:image/png;base64,aGVsbG8=",
          mimeType: "image/png",
        },
      ],
      status: "completed",
      error: null,
      usage: null,
      sources: [],
      createdAt: "2026-09-05T00:00:00Z",
      updatedAt: "2026-09-05T00:00:00Z",
    };
    expect(() =>
      toChatContext(
        [message],
        resolveChatModel({ ...config, modelCapabilities: ["chat"] }),
      ),
    ).toThrow("does not support images");
    expect(
      toChatContext(
        [message],
        resolveChatModel({ ...config, modelCapabilities: ["chat", "vision"] }),
      ).messages[0],
    ).toMatchObject({
      role: "user",
      content: [{ type: "image", mimeType: "image/png", data: "aGVsbG8=" }],
    });
    expect(() =>
      toChatContext(
        [
          {
            ...message,
            content: [
              {
                type: "image",
                image: "https://example.test/image.png",
                mimeType: "image/png",
              },
            ],
          },
        ],
        resolveChatModel(config),
      ),
    ).toThrow("data URLs");
  });
});
