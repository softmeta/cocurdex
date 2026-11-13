import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { generatePiText } from "@cocurdex/agent-adapters/internal/pi-sdk/pi-title";
import type {
  ProviderConfigRecord,
  ProviderModelRecord,
} from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const now = "2026-11-07T00:00:00.000Z";
const tempDirs = createTempDirs();
const requests: IncomingHttpHeaders[] = [];

function chunk(delta: Record<string, unknown>, finishReason: string | null) {
  const body = {
    id: "chatcmpl-1",
    object: "chat.completion.chunk",
    created: 0,
    model: "model",
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
  return `data: ${JSON.stringify(body)}\n\n`;
}

const server = createServer((request, response) => {
  requests.push(request.headers);
  request.resume();
  request.on("end", () => {
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.write(chunk({ role: "assistant", content: "Hi there" }, null));
    response.write(chunk({}, "stop"));
    response.end("data: [DONE]\n\n");
  });
});

let baseUrl = "";

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await tempDirs.cleanup();
});

beforeEach(() => {
  requests.length = 0;
});

function records(providerId: string): {
  provider: ProviderConfigRecord;
  model: ProviderModelRecord;
} {
  return {
    provider: {
      id: providerId,
      name: providerId,
      baseUrl,
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

function generate(providerId: string, apiKey: string | null = null) {
  return generatePiText({
    ...records(providerId),
    userDataPath: tempDirs.createSync("pi-title-"),
    apiKey,
    systemPrompt: "system",
    message: "hello",
    maxTokens: 64,
  });
}

describe("generatePiText", () => {
  it("reaches a keyless custom provider the way agent runs do", async () => {
    expect(await generate("local-llm")).toBe("Hi there");
    expect(requests).toHaveLength(1);
  });

  it("sends the stored key to a built-in provider at the configured endpoint", async () => {
    expect(await generate("openrouter", "sk-stored")).toBe("Hi there");
    expect(requests[0]?.authorization).toBe("Bearer sk-stored");
  });

  it("sends no placeholder key to a built-in provider without a credential", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", undefined);
    await generate("openrouter")
      .catch(() => null)
      .finally(() => vi.unstubAllEnvs());
    expect(requests.every((headers) => !headers.authorization)).toBe(true);
  });
});
