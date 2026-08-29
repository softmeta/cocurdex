import type {
  ConversationContentPart,
  ConversationSource,
  ConversationUsage,
} from "@cocurdex/shared";
import {
  type LanguageModel,
  type ModelMessage,
  stepCountIs,
  streamText,
  type UserContent,
} from "ai";
import type { LlmProviderKind } from "./provider-kind";
import { planWebSearch } from "./web-search";

// One unified stream delta surface so the daemon doesn't need to know about
// AI SDK's full chunk taxonomy. Anything beyond text/source/tool-call/usage
// is silently dropped (e.g. reasoning, finish-step events).
export type ChatStreamDelta =
  | { type: "text"; delta: string }
  | { type: "source"; source: ConversationSource }
  | { type: "tool-call"; toolCallId: string; toolName: string; input: unknown }
  | {
      type: "tool-result";
      toolCallId: string;
      toolName: string;
      output: unknown;
    }
  | { type: "usage"; usage: ConversationUsage };

export interface StreamChatParams {
  model: LanguageModel;
  providerKind: LlmProviderKind;
  messages: ModelMessage[];
  system?: string;
  webSearch?: boolean;
  abortSignal?: AbortSignal;
  onDelta: (delta: ChatStreamDelta) => void;
}

export interface StreamChatResult {
  text: string;
  usage: ConversationUsage | null;
  sources: ConversationSource[];
  finishReason: string | null;
}

// Drives a single assistant turn through the AI SDK. Provider-hosted web
// search is plugged in here so the conversation layer only sees normalised
// deltas — see web-search.ts for the per-provider mapping.
export async function streamChat(
  params: StreamChatParams,
): Promise<StreamChatResult> {
  const tools = params.webSearch
    ? (planWebSearch(params.providerKind) ?? undefined)
    : undefined;
  // `stopWhen` only matters if there are tools; otherwise the model just
  // produces a single assistant turn.
  const stopWhen = tools ? stepCountIs(5) : undefined;

  const result = streamText({
    model: params.model,
    system: params.system,
    messages: params.messages,
    abortSignal: params.abortSignal,
    tools,
    stopWhen,
  });

  const sources: ConversationSource[] = [];
  let aggregateText = "";
  let usage: ConversationUsage | null = null;
  let finishReason: string | null = null;

  for await (const chunk of result.fullStream) {
    switch (chunk.type) {
      case "text-delta": {
        if (!chunk.text) break;
        aggregateText += chunk.text;
        params.onDelta({ type: "text", delta: chunk.text });
        break;
      }
      case "source": {
        if (chunk.sourceType !== "url") break;
        const source: ConversationSource = {
          url: chunk.url,
          title: chunk.title || chunk.url,
          snippet: null,
          providerSourceId: chunk.id ?? null,
        };
        sources.push(source);
        params.onDelta({ type: "source", source });
        break;
      }
      case "tool-call": {
        params.onDelta({
          type: "tool-call",
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName,
          input: chunk.input,
        });
        break;
      }
      case "tool-result": {
        params.onDelta({
          type: "tool-result",
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName,
          output: chunk.output,
        });
        break;
      }
      case "finish": {
        finishReason = chunk.finishReason ?? null;
        if (chunk.totalUsage) {
          usage = {
            inputTokens: chunk.totalUsage.inputTokens,
            outputTokens: chunk.totalUsage.outputTokens,
            totalTokens: chunk.totalUsage.totalTokens,
          };
          params.onDelta({ type: "usage", usage });
        }
        break;
      }
      case "error": {
        // streamText never throws — failures (bad key, rate limit, network)
        // surface as error parts. Rethrow so callers see a failed turn
        // instead of an empty successful one.
        throw chunk.error instanceof Error
          ? chunk.error
          : new Error(String(chunk.error));
      }
      // Other event types (reasoning, raw, etc.) are intentionally ignored.
      default:
        break;
    }
  }

  return { text: aggregateText, usage, sources, finishReason };
}

// Convert our persisted ConversationContentPart shape into AI SDK
// ModelMessages. Tool-call/result parts are dropped: our web-search tools are
// provider-executed, so their transcripts can't be replayed as client tool
// messages (which would require a `tool` role we don't persist). Messages
// that end up empty (e.g. errored assistant turns) are skipped — providers
// reject empty content blocks.
export function toModelMessages(
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: ConversationContentPart[];
  }>,
): ModelMessage[] {
  const out: ModelMessage[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      const text = joinTextParts(message.content);
      if (text) out.push({ role: "system", content: text });
      continue;
    }

    if (message.role === "user") {
      const parts: Exclude<UserContent, string> = [];
      for (const part of message.content) {
        if (part.type === "text" && part.text) {
          parts.push({ type: "text", text: part.text });
        } else if (part.type === "image") {
          parts.push({
            type: "image",
            image: part.image,
            mediaType: part.mimeType,
          });
        }
      }
      if (parts.length > 0) out.push({ role: "user", content: parts });
      continue;
    }

    const text = joinTextParts(message.content);
    if (text) out.push({ role: "assistant", content: text });
  }

  return out;
}

function joinTextParts(content: ConversationContentPart[]): string {
  return content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n")
    .trim();
}
