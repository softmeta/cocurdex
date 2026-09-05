import type { AgentRuntimeProviderConfig } from "@cocurdex/shared";
import type { Api, Model } from "@earendil-works/pi-ai";

function parseObject(value?: string | null): Record<string, unknown> {
  if (!value) return {};
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Model configuration must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function price(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function resolveChatModel(
  config: AgentRuntimeProviderConfig,
): Model<Api> {
  const cost = parseObject(config.modelCostJson);
  const headers = parseObject(config.headersJson);
  for (const value of Object.values(headers)) {
    if (value !== null && typeof value !== "string") {
      throw new Error("Provider headers must contain strings or null");
    }
  }
  const capabilities = config.modelCapabilities;
  const input: ("text" | "image")[] = ["text"];
  if (!capabilities?.length || capabilities.includes("vision"))
    input.push("image");
  return {
    id: config.modelId,
    name: config.modelName || config.modelId,
    api: config.api,
    provider: config.providerId,
    baseUrl: config.modelBaseUrl || config.baseUrl,
    headers: headers as Record<string, string | null>,
    reasoning: config.supportsReasoning ?? false,
    thinkingLevelMap: parseObject(config.modelThinkingLevelMapJson),
    input,
    cost: {
      input: price(cost.input),
      output: price(cost.output),
      cacheRead: price(cost.cacheRead),
      cacheWrite: price(cost.cacheWrite),
    },
    contextWindow: config.modelContextWindow || 128_000,
    maxTokens: config.modelMaxTokens || 4096,
    compat: parseObject(config.modelCompatJson ?? config.providerCompatJson),
  } as Model<Api>;
}
