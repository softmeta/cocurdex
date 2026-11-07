import { generatePiText } from "@cocurdex/agent-adapters/internal/pi-sdk/pi-title";
import type {
  ProviderConfigRecord,
  ProviderModelRecord,
} from "@cocurdex/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const completeSimple = vi.hoisted(() => vi.fn());

vi.mock("@earendil-works/pi-ai/compat", () => ({ completeSimple }));

const now = "2026-11-07T00:00:00.000Z";

function records(providerId: string): {
  provider: ProviderConfigRecord;
  model: ProviderModelRecord;
} {
  return {
    provider: {
      id: providerId,
      name: providerId,
      baseUrl: "http://127.0.0.1:1/v1",
      enabled: true,
      apiKeySecretId: null,
      headersJson: null,
      compatJson: null,
      createdAt: now,
      updatedAt: now,
    },
    model: {
      providerId,
      modelId: "model",
      name: "Model",
      api: "openai-completions",
      enabled: true,
      source: "manual",
      baseUrl: null,
      createdAt: now,
      updatedAt: now,
    },
  };
}

function generate(providerId: string) {
  return generatePiText({
    ...records(providerId),
    apiKey: null,
    systemPrompt: "system",
    message: "hello",
    maxTokens: 64,
  });
}

describe("generatePiText", () => {
  beforeEach(() => {
    completeSimple.mockReset();
    completeSimple.mockResolvedValue({
      stopReason: "stop",
      content: [{ type: "text", text: "Hi there" }],
    });
  });

  it("reaches a keyless custom provider the way agent runs do", async () => {
    expect(await generate("local-llm")).toBe("Hi there");
    expect(completeSimple.mock.calls[0]?.[2]).toMatchObject({
      apiKey: expect.any(String),
    });
  });

  it("sends no placeholder key to a built-in provider", async () => {
    await generate("anthropic");
    expect(completeSimple.mock.calls[0]?.[2]?.apiKey).toBeUndefined();
  });
});
