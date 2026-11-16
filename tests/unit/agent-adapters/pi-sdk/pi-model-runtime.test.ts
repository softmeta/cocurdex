import { resolvePiRuntimeModel } from "@cocurdex/agent-adapters/internal/pi-sdk/pi-model-runtime";
import type { RuntimeProviderConfig } from "@cocurdex/agent-core";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

const OPENROUTER_TEMPLATE = {
  provider: "openrouter",
  id: "anthropic/claude-sonnet-4.5",
  name: "Claude Sonnet 4.5",
  api: "openai-completions",
  baseUrl: "https://openrouter.ai/api/v1",
  input: ["text", "image"],
};

function fakeRuntime() {
  const registered: { providerId: string; config: Record<string, unknown> }[] =
    [];
  const runtime = {
    setRuntimeApiKey: vi.fn(),
    removeRuntimeApiKey: vi.fn(),
    getModels: vi.fn(() => []),
    registerProvider: vi.fn(
      (providerId: string, config: Record<string, unknown>) => {
        registered.push({ providerId, config });
      },
    ),
    getModel: vi.fn((providerId: string) =>
      providerId === "openrouter" ? OPENROUTER_TEMPLATE : undefined,
    ),
  };
  return { runtime, registered };
}

function config(
  override: Partial<RuntimeProviderConfig> = {},
): RuntimeProviderConfig {
  return {
    providerId: "openrouter",
    providerName: "OpenRouter",
    modelId: "anthropic/claude-sonnet-4.5",
    modelName: "Claude Sonnet 4.5",
    api: "openai-completions",
    baseUrl: "https://openrouter.ai/api/v1",
    headersJson: JSON.stringify({ "HTTP-Referer": "https://cocurdex.local" }),
    apiKey: "sk-test",
    ...override,
  };
}

function resolve(
  runtime: ReturnType<typeof fakeRuntime>["runtime"],
  override?: Partial<RuntimeProviderConfig>,
) {
  return resolvePiRuntimeModel(
    runtime as unknown as ModelRuntime,
    config(override),
  );
}

describe("resolvePiRuntimeModel", () => {
  it("lets keyless custom providers through while built-ins still need a key", async () => {
    const custom = fakeRuntime();
    await resolve(custom.runtime, { providerId: "local-llm", apiKey: null });
    expect(custom.runtime.setRuntimeApiKey).toHaveBeenCalledWith(
      "local-llm",
      expect.any(String),
    );

    const builtIn = fakeRuntime();
    await resolve(builtIn.runtime, { providerId: "anthropic", apiKey: null });
    expect(builtIn.runtime.setRuntimeApiKey).not.toHaveBeenCalled();
    expect(builtIn.runtime.removeRuntimeApiKey).toHaveBeenCalledWith(
      "anthropic",
    );
  });

  it("registers a custom provider's model with its api and metadata", async () => {
    const { runtime, registered } = fakeRuntime();
    await resolve(runtime, {
      providerId: "local-llm",
      api: "anthropic-messages",
      providerCompatJson: JSON.stringify({ providerLevel: true }),
      modelCompatJson: JSON.stringify({ stream: false }),
      modelCapabilities: ["agent", "chat", "vision", "reasoning"],
      modelCostJson: JSON.stringify({ input: 3, output: 15, cacheRead: 1 }),
      modelThinkingLevelMapJson: JSON.stringify({ high: 10000 }),
      modelContextWindow: 200000,
      modelMaxTokens: 64000,
      supportsReasoning: true,
    });

    const provider = registered.at(-1)?.config;
    expect(provider?.api).toBe("anthropic-messages");
    const [model] = (provider?.models ?? []) as Record<string, unknown>[];
    expect(model).toMatchObject({
      api: "anthropic-messages",
      contextWindow: 200000,
      maxTokens: 64000,
      reasoning: true,
      input: ["text", "image"],
      cost: { input: 3, output: 15, cacheRead: 1, cacheWrite: 0 },
      thinkingLevelMap: { high: 10000 },
      compat: { stream: false },
    });
  });

  it("omits image input for a custom non-vision model", async () => {
    const { runtime, registered } = fakeRuntime();
    await resolve(runtime, {
      providerId: "local-llm",
      modelCapabilities: ["agent", "chat"],
    });
    const [model] = (registered.at(-1)?.config.models ?? []) as Record<
      string,
      unknown
    >[];
    expect(model.input).toEqual(["text"]);
  });

  it("keeps a built-in provider in Pi and layers on only the key and model edits", async () => {
    const { runtime, registered } = fakeRuntime();
    const model = await resolve(runtime, {
      baseUrl: "https://proxy.example.invalid/v1",
      modelCapabilities: ["agent", "chat"],
    });

    expect(runtime.setRuntimeApiKey).toHaveBeenCalledWith(
      "openrouter",
      "sk-test",
    );
    expect(registered).toHaveLength(0);
    expect(model).toMatchObject({
      provider: "openrouter",
      baseUrl: "https://proxy.example.invalid/v1",
      input: ["text"],
    });
  });
});
