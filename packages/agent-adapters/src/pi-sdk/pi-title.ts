import type {
  ProviderConfigRecord,
  ProviderModelRecord,
} from "@cocurdex/shared";
import type { Api, Context, Model } from "@earendil-works/pi-ai";
import { completeSimple } from "@earendil-works/pi-ai/compat";
import {
  buildModelCost,
  buildModelInput,
  parseHeaders,
  parseJsonObject,
} from "./pi-model-utils";

const TITLE_PROMPT = `Summarize the user's first message into a concise chat title.

Rules:
- Maximum 6 words.
- No punctuation at the end.
- No quotes, no markdown, no emoji.
- Use the same language as the user's message.
- Reply with the title only, nothing else.`;

// Generous cap: a 6-word title needs a fraction of this, but a model whose
// thinking cannot be disabled may spend tokens reasoning first. Truncation
// then yields empty text -> null -> the caller keeps its fallback title.
const TITLE_MAX_TOKENS = 512;

// Rebuild a pi Model from Cocurdex provider records. Records sourced from the
// pi catalog round-trip reasoning/thinkingLevelMap/compat, so pi's per-vendor
// thinking handling applies unchanged — with no reasoning requested it sends
// the right "disable thinking" parameter per provider (deepseek/zai/qwen/...).
// Manually configured models lack compat and fall back to pi's URL-based
// auto-detection.
const OPENCODE_SESSION_HEADER = "x-opencode-session";
const OPENCODE_PROVIDER_IDS = new Set(["opencode", "opencode-go"]);

export function withOpenCodeSession(
  provider: ProviderConfigRecord,
  headers: Record<string, string> | undefined,
  sessionId: string | undefined,
) {
  if (!sessionId || !OPENCODE_PROVIDER_IDS.has(provider.id)) return headers;
  const present = Object.keys(headers ?? {}).some(
    (key) => key.toLowerCase() === OPENCODE_SESSION_HEADER,
  );
  return present
    ? headers
    : { ...headers, [OPENCODE_SESSION_HEADER]: sessionId };
}

function buildPiTitleModel(
  provider: ProviderConfigRecord,
  model: ProviderModelRecord,
  sessionId?: string,
): Model<Api> {
  return {
    id: model.modelId,
    name: model.name || model.modelId,
    api: model.api,
    provider: provider.id,
    baseUrl: model.baseUrl || provider.baseUrl,
    reasoning: model.reasoning ?? false,
    thinkingLevelMap: parseJsonObject(model.thinkingLevelMapJson),
    input: buildModelInput(model.capabilities),
    cost: buildModelCost(model.costJson),
    contextWindow: model.contextLimit ?? 0,
    maxTokens: model.outputLimit ?? 0,
    headers: withOpenCodeSession(
      provider,
      parseHeaders(provider.headersJson),
      sessionId,
    ),
    compat:
      parseJsonObject(model.compatJson) ?? parseJsonObject(provider.compatJson),
  } as Model<Api>;
}

function normalizeTitle(raw: string): string | null {
  const trimmed = raw.trim().replace(/^["'`]+|["'`]+$/g, "");
  if (!trimmed) {
    return null;
  }

  // Slice by code points, not UTF-16 units, so an emoji is never cut in half.
  const chars = [...trimmed];
  return chars.length > 64 ? `${chars.slice(0, 60).join("")}…` : trimmed;
}

export async function generatePiText(params: {
  provider: ProviderConfigRecord;
  model: ProviderModelRecord;
  apiKey: string | null;
  systemPrompt: string;
  message: string;
  maxTokens: number;
  sessionId?: string;
  signal?: AbortSignal;
}): Promise<string | null> {
  const model = buildPiTitleModel(
    params.provider,
    params.model,
    params.sessionId,
  );
  const context: Context = {
    systemPrompt: params.systemPrompt,
    messages: [
      { role: "user", content: params.message, timestamp: Date.now() },
    ],
  };

  const result = await completeSimple(model, context, {
    apiKey: params.apiKey ?? undefined,
    signal: params.signal,
    maxTokens: params.maxTokens,
  });

  if (result.stopReason === "error" || result.stopReason === "aborted") {
    throw new Error(
      result.errorMessage || `Text generation ${result.stopReason}`,
    );
  }

  return (
    result.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join(" ")
      .trim() || null
  );
}

// Single-shot title synthesis through the pi ai layer. Returns null when the
// model produced no usable text; the caller keeps its fallback title.
export async function generatePiConversationTitle(params: {
  provider: ProviderConfigRecord;
  model: ProviderModelRecord;
  apiKey: string | null;
  message: string;
  sessionId?: string;
  signal?: AbortSignal;
}): Promise<string | null> {
  const text = await generatePiText({
    provider: params.provider,
    model: params.model,
    apiKey: params.apiKey,
    systemPrompt: TITLE_PROMPT,
    message: params.message,
    maxTokens: TITLE_MAX_TOKENS,
    sessionId: params.sessionId,
    signal: params.signal,
  });
  return text ? normalizeTitle(text) : null;
}
