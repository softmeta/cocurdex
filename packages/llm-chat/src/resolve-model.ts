import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type {
  ProviderConfigRecord,
  ProviderModelRecord,
} from "@cocurdex/shared";
import type { LanguageModel } from "ai";
import { classifyProvider, type LlmProviderKind } from "./provider-kind";

export interface ResolvedLanguageModel {
  model: LanguageModel;
  providerKind: LlmProviderKind;
}

// Build a Vercel AI SDK LanguageModel from a stored ProviderConfig + model +
// API key. The conversation layer never sees raw SDK clients — this is the
// single mapping point.
export function resolveLanguageModel(
  provider: ProviderConfigRecord,
  model: ProviderModelRecord,
  apiKey: string | null,
): ResolvedLanguageModel {
  const providerKind = classifyProvider(provider, model.api);
  const headers = buildLanguageModelHeaders(provider);

  switch (providerKind) {
    case "openai": {
      const client = createOpenAI({
        apiKey: apiKey ?? undefined,
        baseURL: provider.baseUrl || undefined,
        headers,
      });
      return { model: client(model.modelId), providerKind };
    }
    case "anthropic": {
      const isCustomEndpoint = isCustomAnthropicEndpoint(provider.baseUrl);
      const client = createAnthropic({
        apiKey: isCustomEndpoint ? undefined : (apiKey ?? undefined),
        authToken: isCustomEndpoint ? (apiKey ?? undefined) : undefined,
        baseURL: normalizeAnthropicBaseUrl(provider.baseUrl) || undefined,
        headers,
      });
      return { model: client(model.modelId), providerKind };
    }
    case "google": {
      const client = createGoogleGenerativeAI({
        apiKey: apiKey ?? undefined,
        baseURL: provider.baseUrl || undefined,
        headers,
      });
      return { model: client(model.modelId), providerKind };
    }
    case "openai-compatible": {
      const client = createOpenAICompatible({
        name: provider.name || "openai-compatible",
        apiKey: apiKey ?? undefined,
        baseURL: provider.baseUrl,
        headers,
      });
      return { model: client(model.modelId), providerKind };
    }
  }
}

export function buildLanguageModelHeaders(
  provider: Pick<ProviderConfigRecord, "headersJson">,
): Record<string, string> | undefined {
  return parseHeaders(provider.headersJson);
}

// The Anthropic SDK expects a versioned base URL (".../v1") — its default is
// https://api.anthropic.com/v1. Stored configs may omit the suffix, so append
// it for official and proxy endpoints alike.
export function normalizeAnthropicBaseUrl(baseUrl: string) {
  const trimmedBaseUrl = baseUrl.replace(/\/+$/, "");
  if (!trimmedBaseUrl || trimmedBaseUrl.endsWith("/v1")) {
    return trimmedBaseUrl;
  }

  return `${trimmedBaseUrl}/v1`;
}

function parseHeaders(
  raw: string | null | undefined,
): Record<string, string> | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") {
        out[key] = value;
      }
    }
    return Object.keys(out).length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}

function isCustomAnthropicEndpoint(baseUrl: string) {
  const normalizedBaseUrl = baseUrl.toLowerCase();
  return (
    normalizedBaseUrl.length > 0 &&
    !normalizedBaseUrl.includes("api.anthropic.com")
  );
}
