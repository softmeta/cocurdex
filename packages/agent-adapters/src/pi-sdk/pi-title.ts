import type {
  ProviderConfigRecord,
  ProviderModelRecord,
} from "@cocurdex/shared";
import { createProviderSnapshotForModel } from "@cocurdex/shared";
import type { Context } from "@earendil-works/pi-ai";
import {
  createPiModelRuntime,
  resolvePiRuntimeModel,
} from "./pi-model-runtime";

const TITLE_PROMPT = `Summarize the user's first message into a concise chat title.

Rules:
- Maximum 6 words.
- No punctuation at the end.
- No quotes, no markdown, no emoji.
- Use the same language as the user's message.
- Reply with the title only, nothing else.`;

const TITLE_MAX_TOKENS = 512;

function normalizeTitle(raw: string): string | null {
  const trimmed = raw.trim().replace(/^["'`]+|["'`]+$/g, "");
  if (!trimmed) {
    return null;
  }

  const chars = [...trimmed];
  return chars.length > 64 ? `${chars.slice(0, 60).join("")}…` : trimmed;
}

export interface PiTextModel {
  userDataPath: string;
  provider: ProviderConfigRecord;
  model: ProviderModelRecord;
  apiKey: string | null;
}

export async function generatePiText(
  params: PiTextModel & {
    systemPrompt: string;
    message: string;
    maxTokens: number;
    sessionId?: string;
    signal?: AbortSignal;
  },
): Promise<string | null> {
  const providerConfig = {
    ...createProviderSnapshotForModel({
      provider: params.provider,
      model: params.model,
    }),
    apiKey: params.apiKey,
  };
  const runtime = await createPiModelRuntime(params.userDataPath, {
    refresh: "cache",
    providers: [params.provider.id],
    signal: params.signal,
  });
  const model = await resolvePiRuntimeModel(runtime, providerConfig);
  if (!model) {
    throw new Error(
      `Pi has no model ${params.model.modelId} for provider ${params.provider.id}`,
    );
  }
  const context: Context = {
    systemPrompt: params.systemPrompt,
    messages: [
      { role: "user", content: params.message, timestamp: Date.now() },
    ],
  };

  const result = await runtime.completeSimple(model, context, {
    signal: params.signal,
    maxTokens: params.maxTokens,
    sessionId: params.sessionId,
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

export async function generatePiConversationTitle(
  params: PiTextModel & {
    message: string;
    sessionId?: string;
    signal?: AbortSignal;
  },
): Promise<string | null> {
  const text = await generatePiText({
    userDataPath: params.userDataPath,
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
