import type {
  AgentRuntimeProviderConfig,
  ConversationMessageRecord,
  ConversationUsage,
} from "@cocurdex/shared";
import type {
  AssistantMessage,
  Context,
  ProviderStreams,
} from "@earendil-works/pi-ai";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { googleGenerativeAIApi } from "@earendil-works/pi-ai/api/google-generative-ai.lazy";
import { mistralConversationsApi } from "@earendil-works/pi-ai/api/mistral-conversations.lazy";
import { openAICodexResponsesApi } from "@earendil-works/pi-ai/api/openai-codex-responses.lazy";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import { toChatContext } from "./chat-context";
import { resolveChatModel } from "./resolve-model";

const apiFactories = {
  "openai-completions": openAICompletionsApi,
  "openai-responses": openAIResponsesApi,
  "openai-codex-responses": openAICodexResponsesApi,
  "anthropic-messages": anthropicMessagesApi,
  "google-generative-ai": googleGenerativeAIApi,
  "mistral-conversations": mistralConversationsApi,
};

export interface StreamChatParams {
  providerConfig: AgentRuntimeProviderConfig;
  messages: ConversationMessageRecord[];
  system?: string;
  abortSignal?: AbortSignal;
  onDelta(delta: string): void;
}

export interface StreamChatResult {
  text: string;
  usage: ConversationUsage;
  status: "completed" | "cancelled" | "errored";
  error: string | null;
}

export function createChatStreamRunner(
  resolveApi: (api: string) => ProviderStreams,
) {
  return async (params: StreamChatParams): Promise<StreamChatResult> => {
    const model = resolveChatModel(params.providerConfig);
    const context = toChatContext(params.messages, model, params.system);
    const stream = resolveApi(model.api).streamSimple(model, context, {
      apiKey: params.providerConfig.apiKey ?? undefined,
      headers: model.headers,
      signal: params.abortSignal,
    });
    for await (const event of stream) {
      if (event.type === "text_delta") params.onDelta(event.delta);
    }
    return mapChatResult(
      await stream.result(),
      params.abortSignal?.aborted ?? false,
    );
  };
}

function resolveApi(api: string): ProviderStreams {
  const factory = apiFactories[api as keyof typeof apiFactories];
  if (!factory) throw new Error(`Chat does not support provider API: ${api}`);
  return factory();
}

export const streamChat = createChatStreamRunner(resolveApi);

export function validateChatRequest(
  config: AgentRuntimeProviderConfig,
  messages: ConversationMessageRecord[],
) {
  const model = resolveChatModel(config);
  resolveApi(model.api);
  toChatContext(messages, model);
}

function mapChatResult(
  message: AssistantMessage,
  aborted: boolean,
): StreamChatResult {
  let status: StreamChatResult["status"] = "completed";
  if (aborted || message.stopReason === "aborted") status = "cancelled";
  else if (message.stopReason === "error") status = "errored";
  const usage = message.usage;
  return {
    text: message.content
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join(""),
    usage: {
      inputTokens: usage.input + usage.cacheRead + usage.cacheWrite,
      outputTokens: usage.output,
      totalTokens: usage.totalTokens,
      cacheReadInputTokens: usage.cacheRead,
      cacheCreationInputTokens: usage.cacheWrite,
      costUsd: usage.cost.total,
      finishReason: message.stopReason,
    },
    status,
    error:
      status === "errored"
        ? message.errorMessage || "Model request failed"
        : null,
  };
}

export async function generateChatTitle(
  providerConfig: AgentRuntimeProviderConfig,
  text: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const model = resolveChatModel(providerConfig);
  const context: Context = {
    systemPrompt:
      "Summarize the user's message as a concise title. Maximum 6 words. Use the user's language. Reply with the title only, without quotes or punctuation at the end.",
    messages: [{ role: "user", content: text, timestamp: Date.now() }],
  };
  const stream = resolveApi(model.api).streamSimple(model, context, {
    apiKey: providerConfig.apiKey ?? undefined,
    headers: model.headers,
    maxTokens: 512,
    signal,
  });
  const result = await stream.result();
  if (result.stopReason === "error" || result.stopReason === "aborted")
    return null;
  const title = result.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join(" ")
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "");
  return title ? [...title].slice(0, 64).join("") : null;
}
