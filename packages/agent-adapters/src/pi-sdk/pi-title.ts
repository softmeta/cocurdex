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
function buildPiTitleModel(
  provider: ProviderConfigRecord,
  model: ProviderModelRecord,
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
    headers: parseHeaders(provider.headersJson),
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

// Single-shot title synthesis through the pi ai layer. Returns null when the
// model produced no usable text; the caller keeps its fallback title.
export async function generatePiConversationTitle(params: {
  provider: ProviderConfigRecord;
  model: ProviderModelRecord;
  apiKey: string | null;
  message: string;
  signal?: AbortSignal;
}): Promise<string | null> {
  const model = buildPiTitleModel(params.provider, params.model);
  const context: Context = {
    systemPrompt: TITLE_PROMPT,
    messages: [
      { role: "user", content: params.message, timestamp: Date.now() },
    ],
  };

  const result = await completeSimple(model, context, {
    apiKey: params.apiKey ?? undefined,
    signal: params.signal,
    maxTokens: TITLE_MAX_TOKENS,
  });

  if (result.stopReason === "error" || result.stopReason === "aborted") {
    throw new Error(
      result.errorMessage || `Title generation ${result.stopReason}`,
    );
  }

  const text = result.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join(" ");

  return normalizeTitle(text);
}
