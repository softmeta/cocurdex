// ChatGPT-style pure conversation service. Lives in the Electron main process
// because it needs direct DB access and safeStorage for API-key decryption.
//
// IPC channels (all under `chat:*`):
//   chat:list                 list conversations
//   chat:get                  load conversation + messages
//   chat:create               create + return record
//   chat:update               edit title/system prompt/web_search_enabled/model
//   chat:archive              soft delete
//   chat:delete               hard delete (cascades messages)
//   chat:sendMessage          append user message + start streaming response
//   chat:retryMessage         drop an assistant turn (+ later) and re-stream
//   chat:editMessage          edit a user prompt, drop later turns, re-stream
//   chat:stopStream           abort in-flight stream
//
// Stream events fan out on the `chat:event` renderer channel as ChatEvent.
//
// FORMATTING_PREAMBLE: prepended to every conversation's effective system
// prompt so the assistant emits math/code in a form our markdown renderer
// (Streamdown + KaTeX) can typeset correctly. Without this, models often
// wrap inline math in backticks, which renders as monospace code instead
// of KaTeX. Kept short and language-neutral so it does not override the
// user's own system prompt or preset persona.

const FORMATTING_PREAMBLE = [
  "Formatting rules:",
  "- Use $...$ for inline math and $$...$$ (or \\[...\\]) for block math.",
  "- Never wrap math expressions in backticks. Backticks are only for code identifiers, file paths, shell commands, or programming snippets.",
  "- Use fenced code blocks (```lang) for multi-line code.",
].join("\n");

function buildEffectiveSystemPrompt(userPrompt: string | null): string {
  const trimmed = userPrompt?.trim();
  if (!trimmed) {
    return FORMATTING_PREAMBLE;
  }
  return `${FORMATTING_PREAMBLE}\n\n${trimmed}`;
}

import { generatePiConversationTitle } from "@cocurdex/agent-adapters/desktop-provider";
import {
  type ChatStreamDelta,
  resolveLanguageModel,
  streamChat,
  toModelMessages,
} from "@cocurdex/llm-chat";
import type {
  ChatEvent,
  ConversationContentPart,
  ConversationImagePart,
  ConversationMessageRecord,
  ConversationRecord,
  ConversationSource,
  ConversationTextPart,
  ConversationUsage,
  CreateConversationPayload,
  EditConversationMessagePayload,
  RetryConversationMessagePayload,
  SendConversationMessagePayload,
  UpdateConversationPayload,
} from "@cocurdex/shared";
import { type IpcMain, type IpcMainInvokeEvent, safeStorage } from "electron";
import { z } from "zod";
import { idSchema, registerHandler } from "../ipc";
import { createLogger } from "../logging";
import {
  listConfiguredProviderModels,
  resolveDedicatedTitleModel,
} from "../provider/provider-service";
import {
  archiveConversation as archiveConversationState,
  deleteConversation as deleteConversationState,
  getConversation,
  getProviderConfig,
  getProviderSecret,
  listConversationMessages,
  listConversations,
  patchConversationMessage,
  saveConversation,
  saveConversationMessage,
  truncateConversationMessages,
  updateConversationTitle,
} from "./app-state";

const logger = createLogger("chat-service");

let broadcaster: ((event: ChatEvent) => void) | null = null;

export function configureChatEventBroadcast(
  broadcast: (event: ChatEvent) => void,
) {
  broadcaster = broadcast;
}

function emit(event: ChatEvent) {
  broadcaster?.(event);
}

// Active streams keyed by conversationId so the renderer can cancel mid-flight.
const activeStreams = new Map<string, AbortController>();

function decryptSecretValue(encryptedValue: string) {
  const buffer = Buffer.from(encryptedValue, "base64");
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(buffer);
  }
  return buffer.toString("utf8");
}

async function resolveApiKey(providerId: string): Promise<string | null> {
  const provider = await getProviderConfig(providerId);
  if (!provider?.apiKeySecretId) return null;
  const secret = await getProviderSecret(provider.apiKeySecretId);
  return secret ? decryptSecretValue(secret.encryptedValue) : null;
}

function nowIso() {
  return new Date().toISOString();
}

// Estimate turn cost from the model's cost table. Prices are USD per 1M tokens
// ({ input, output }); returns undefined when the model declares no pricing so
// the footer can hide the cost segment rather than show "$0.000".
function estimateCostUsd(
  costJson: string | null | undefined,
  usage: ConversationUsage | null,
): number | undefined {
  if (!costJson || !usage) {
    return undefined;
  }

  let cost: { input?: number; output?: number };
  try {
    cost = JSON.parse(costJson);
  } catch {
    return undefined;
  }

  const inputPrice = cost.input ?? 0;
  const outputPrice = cost.output ?? 0;
  if (inputPrice === 0 && outputPrice === 0) {
    return undefined;
  }

  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  return (inputTokens * inputPrice + outputTokens * outputPrice) / 1_000_000;
}

function textPart(text: string): ConversationTextPart {
  return { type: "text", text };
}

function imagePart(image: string, mimeType?: string): ConversationImagePart {
  return { type: "image", image, mimeType };
}

async function createConversation(
  payload: CreateConversationPayload,
): Promise<ConversationRecord> {
  const now = nowIso();
  const record: ConversationRecord = {
    id: crypto.randomUUID(),
    title: payload.title?.trim() || "New chat",
    providerId: payload.providerId,
    modelId: payload.modelId,
    systemPrompt: payload.systemPrompt ?? null,
    presetId: payload.presetId ?? null,
    webSearchEnabled: payload.webSearchEnabled ?? false,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: null,
    archivedAt: null,
  };
  await saveConversation(record);
  emit({
    type: "conversation.upserted",
    conversationId: record.id,
    conversation: record,
  });
  return record;
}

async function updateConversation(
  payload: UpdateConversationPayload,
): Promise<ConversationRecord | null> {
  const existing = await getConversation(payload.conversationId);
  if (!existing) return null;
  const next: ConversationRecord = {
    ...existing,
    title: payload.title ?? existing.title,
    systemPrompt:
      payload.systemPrompt !== undefined
        ? payload.systemPrompt
        : existing.systemPrompt,
    presetId:
      payload.presetId !== undefined ? payload.presetId : existing.presetId,
    webSearchEnabled:
      payload.webSearchEnabled !== undefined
        ? payload.webSearchEnabled
        : existing.webSearchEnabled,
    providerId: payload.providerId ?? existing.providerId,
    modelId: payload.modelId ?? existing.modelId,
    updatedAt: nowIso(),
  };
  await saveConversation(next);
  emit({
    type: "conversation.upserted",
    conversationId: next.id,
    conversation: next,
  });
  return next;
}

async function getConversationDetail(conversationId: string) {
  const conversation = await getConversation(conversationId);
  if (!conversation) return null;
  const messages = await listConversationMessages(conversationId);
  return { conversation, messages };
}

// Composes the user message parts (text + image attachments) from the renderer
// payload. We store data URLs directly so SDK calls don't need filesystem
// access — fine for first version, can be optimised later.
function composeUserContent(
  payload: SendConversationMessagePayload,
): ConversationContentPart[] {
  const parts: ConversationContentPart[] = [];
  const trimmed = payload.text.trim();
  if (trimmed) parts.push(textPart(trimmed));
  for (const image of payload.images ?? []) {
    // The renderer is responsible for converting attachment files into data
    // URLs before forwarding them here. This keeps the daemon free of disk
    // IO for attachments.
    if (image.filePath.startsWith("data:")) {
      parts.push(imagePart(image.filePath, image.mimeType));
    }
  }
  return parts;
}

type ResolvedConversationRuntime = {
  conversation: ConversationRecord;
  provider: NonNullable<Awaited<ReturnType<typeof getProviderConfig>>>;
  model: Awaited<ReturnType<typeof listConfiguredProviderModels>>[number];
  languageModel: ReturnType<typeof resolveLanguageModel>["model"];
  providerKind: ReturnType<typeof resolveLanguageModel>["providerKind"];
  apiKey: string | null;
};

async function resolveConversationRuntime(
  conversationId: string,
): Promise<ResolvedConversationRuntime> {
  const conversation = await getConversation(conversationId);
  if (!conversation) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  const provider = await getProviderConfig(conversation.providerId);
  if (!provider) {
    throw new Error(`Provider ${conversation.providerId} not found`);
  }
  // Built-in providers (e.g. opencode-go / pi presets) source their models
  // from the pi runtime and are never persisted to the providerModels table,
  // so a raw DB lookup misses them. listConfiguredProviderModels merges pi
  // built-in models with persisted ones — matching what the model picker sees.
  const models = await listConfiguredProviderModels([provider]);
  const model = models.find((m) => m.modelId === conversation.modelId) ?? null;
  if (!model) {
    throw new Error(
      `Model ${conversation.modelId} not found on provider ${conversation.providerId}`,
    );
  }

  const apiKey = await resolveApiKey(conversation.providerId);
  const { model: languageModel, providerKind } = resolveLanguageModel(
    provider,
    model,
    apiKey,
  );

  return {
    conversation,
    provider,
    model,
    languageModel,
    providerKind,
    apiKey,
  };
}

function assertNoActiveStream(conversationId: string) {
  if (activeStreams.has(conversationId)) {
    throw new Error("A response is already streaming for this conversation");
  }
}

function maybeGenerateTitle(
  runtime: ResolvedConversationRuntime,
  userMessage: ConversationMessageRecord,
) {
  const { conversation, provider, model, apiKey } = runtime;
  if (conversation.title !== "New chat" || userMessage.role !== "user") {
    return;
  }

  const firstUserText = userMessage.content
    .filter((p): p is ConversationTextPart => p.type === "text")
    .map((p) => p.text)
    .join("\n")
    .trim();
  if (!firstUserText) {
    return;
  }

  // First-turn auto title — fire and forget. Only depends on the user text.
  void (async () => {
    try {
      const titleRecords = (await resolveDedicatedTitleModel()) ?? {
        provider,
        model,
        apiKey,
      };
      const title = await generatePiConversationTitle({
        ...titleRecords,
        message: firstUserText,
      });
      if (!title) {
        return;
      }
      const updated = await updateConversationTitle(conversation.id, title);
      if (updated) {
        emit({
          type: "conversation.upserted",
          conversationId: updated.id,
          conversation: updated,
        });
      }
    } catch (error) {
      logger.warn("auto-title.failed", {
        conversationId: conversation.id,
        error: (error as Error).message,
      });
    }
  })();
}

// Creates the streaming assistant placeholder and runs the LLM stream in the
// background. History is whatever is already persisted (excluding the
// placeholder itself).
function beginAssistantStream(
  runtime: ResolvedConversationRuntime,
  webSearchOverride?: boolean,
) {
  const { conversation, model, languageModel, providerKind } = runtime;
  assertNoActiveStream(conversation.id);

  const assistantId = crypto.randomUUID();
  const assistantStart = nowIso();
  const assistantStartMs = Date.now();
  const assistantMessage: ConversationMessageRecord = {
    id: assistantId,
    conversationId: conversation.id,
    role: "assistant",
    content: [{ type: "text", text: "" }],
    status: "streaming",
    usage: null,
    sources: [],
    error: null,
    createdAt: assistantStart,
    updatedAt: assistantStart,
  };

  void (async () => {
    await saveConversationMessage(assistantMessage);
    emit({
      type: "conversation.message.created",
      conversationId: conversation.id,
      message: assistantMessage,
    });

    const previousMessages = await listConversationMessages(conversation.id);
    const history = previousMessages
      .filter((m) => m.id !== assistantId)
      .map((m) => ({ role: m.role, content: m.content }));

    const controller = new AbortController();
    activeStreams.set(conversation.id, controller);

    let aggregateText = "";
    const aggregateSources: ConversationSource[] = [];
    let aggregateUsage: ConversationUsage | null = null;

    try {
      const result = await streamChat({
        model: languageModel,
        providerKind,
        messages: toModelMessages(history),
        system: buildEffectiveSystemPrompt(conversation.systemPrompt),
        webSearch:
          webSearchOverride !== undefined
            ? webSearchOverride
            : conversation.webSearchEnabled,
        abortSignal: controller.signal,
        onDelta: (delta: ChatStreamDelta) => {
          switch (delta.type) {
            case "text": {
              aggregateText += delta.delta;
              emit({
                type: "conversation.message.delta",
                conversationId: conversation.id,
                messageId: assistantId,
                delta: delta.delta,
              });
              break;
            }
            case "source": {
              aggregateSources.push(delta.source);
              emit({
                type: "conversation.message.source",
                conversationId: conversation.id,
                messageId: assistantId,
                source: delta.source,
              });
              break;
            }
            case "tool-call": {
              emit({
                type: "conversation.message.tool-call",
                conversationId: conversation.id,
                messageId: assistantId,
                toolCallId: delta.toolCallId,
                toolName: delta.toolName,
                input: delta.input,
              });
              break;
            }
            case "tool-result": {
              emit({
                type: "conversation.message.tool-result",
                conversationId: conversation.id,
                messageId: assistantId,
                toolCallId: delta.toolCallId,
                toolName: delta.toolName,
                output: delta.output,
              });
              break;
            }
            case "usage": {
              aggregateUsage = delta.usage;
              emit({
                type: "conversation.message.usage",
                conversationId: conversation.id,
                messageId: assistantId,
                usage: delta.usage,
              });
              break;
            }
          }
        },
      });

      const finalContent: ConversationContentPart[] = [
        { type: "text", text: result.text || aggregateText },
      ];
      const baseUsage = result.usage ?? aggregateUsage;
      const finalUsage: ConversationUsage | null = baseUsage
        ? {
            ...baseUsage,
            durationMs: Date.now() - assistantStartMs,
            costUsd: estimateCostUsd(model.costJson, baseUsage),
          }
        : null;
      const finalMessage = await patchConversationMessage(assistantId, {
        content: finalContent,
        status: "completed",
        usage: finalUsage,
        sources: result.sources.length > 0 ? result.sources : aggregateSources,
        updatedAt: nowIso(),
      });

      if (finalMessage) {
        emit({
          type: "conversation.message.completed",
          conversationId: conversation.id,
          message: finalMessage,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Persist partial text so the user can see what came through before the
      // failure, but mark errored so the UI can render the indicator.
      const erroredMessage = await patchConversationMessage(assistantId, {
        content: [{ type: "text", text: aggregateText }],
        status: "errored",
        error: message,
        sources: aggregateSources,
        updatedAt: nowIso(),
      });
      emit({
        type: "conversation.message.errored",
        conversationId: conversation.id,
        messageId: assistantId,
        error: message,
      });
      if (erroredMessage) {
        emit({
          type: "conversation.message.completed",
          conversationId: conversation.id,
          message: erroredMessage,
        });
      }
      logger.warn("stream.failed", {
        conversationId: conversation.id,
        error: message,
      });
    } finally {
      activeStreams.delete(conversation.id);
    }
  })();
}

async function sendConversationMessage(
  payload: SendConversationMessagePayload,
): Promise<ConversationMessageRecord> {
  const runtime = await resolveConversationRuntime(payload.conversationId);
  assertNoActiveStream(runtime.conversation.id);

  const now = nowIso();
  const userMessage: ConversationMessageRecord = {
    id: crypto.randomUUID(),
    conversationId: runtime.conversation.id,
    role: "user",
    content: composeUserContent(payload),
    status: "completed",
    usage: null,
    sources: [],
    error: null,
    createdAt: now,
    updatedAt: now,
  };
  await saveConversationMessage(userMessage);
  emit({
    type: "conversation.message.created",
    conversationId: runtime.conversation.id,
    message: userMessage,
  });

  maybeGenerateTitle(runtime, userMessage);
  beginAssistantStream(runtime, payload.webSearchOverride);
  return userMessage;
}

async function retryConversationMessage(
  payload: RetryConversationMessagePayload,
): Promise<null> {
  const runtime = await resolveConversationRuntime(payload.conversationId);
  assertNoActiveStream(runtime.conversation.id);

  const messages = await listConversationMessages(runtime.conversation.id);
  const target = messages.find((message) => message.id === payload.messageId);
  if (!target) {
    throw new Error(`Message ${payload.messageId} not found`);
  }
  if (target.role !== "assistant") {
    throw new Error("Only assistant messages can be retried or regenerated");
  }

  const remaining = await truncateConversationMessages(
    runtime.conversation.id,
    payload.messageId,
    { inclusive: true },
  );
  emit({
    type: "conversation.messages.truncated",
    conversationId: runtime.conversation.id,
    remainingMessages: remaining,
  });

  beginAssistantStream(runtime);
  return null;
}

async function editConversationMessage(
  payload: EditConversationMessagePayload,
): Promise<ConversationMessageRecord> {
  const runtime = await resolveConversationRuntime(payload.conversationId);
  assertNoActiveStream(runtime.conversation.id);

  const messages = await listConversationMessages(runtime.conversation.id);
  const target = messages.find((message) => message.id === payload.messageId);
  if (!target) {
    throw new Error(`Message ${payload.messageId} not found`);
  }
  if (target.role !== "user") {
    throw new Error("Only user messages can be edited");
  }

  const trimmed = payload.text.trim();
  const imageParts = target.content.filter(
    (part): part is ConversationImagePart => part.type === "image",
  );
  if (!trimmed && imageParts.length === 0) {
    throw new Error("Edited message must include text or an image");
  }

  const remaining = await truncateConversationMessages(
    runtime.conversation.id,
    payload.messageId,
    { inclusive: false },
  );

  const nextContent: ConversationContentPart[] = [];
  if (trimmed) {
    nextContent.push(textPart(trimmed));
  }
  nextContent.push(...imageParts);

  const updatedUser: ConversationMessageRecord = {
    ...target,
    content: nextContent,
    updatedAt: nowIso(),
  };
  await saveConversationMessage(updatedUser);

  const remainingWithEdit = remaining.map((message) =>
    message.id === updatedUser.id ? updatedUser : message,
  );
  emit({
    type: "conversation.messages.truncated",
    conversationId: runtime.conversation.id,
    remainingMessages: remainingWithEdit,
  });

  beginAssistantStream(runtime);
  return updatedUser;
}

function stopConversationStream(conversationId: string) {
  const controller = activeStreams.get(conversationId);
  if (controller) {
    controller.abort();
    activeStreams.delete(conversationId);
  }
}

// === IPC schemas ===

const imageInputSchema = z.object({
  id: z.string().min(1).max(256),
  name: z.string().min(1).max(1024),
  mimeType: z.string().min(1).max(255),
  sizeBytes: z.number().int().nonnegative(),
  // For pure chat the renderer always sends a data: URL — the schema enforces
  // it so safeStorage / disk access is never tricked into reading a file path.
  filePath: z.string().max(20_000_000).startsWith("data:"),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  kind: z.literal("image"),
});

const createPayloadSchema = z.object({
  providerId: z.string().min(1).max(256),
  modelId: z.string().min(1).max(256),
  title: z.string().max(2000).optional(),
  systemPrompt: z.string().max(50_000).nullable().optional(),
  presetId: z.string().max(256).nullable().optional(),
  webSearchEnabled: z.boolean().optional(),
});

const updatePayloadSchema = z.object({
  conversationId: idSchema,
  title: z.string().min(1).max(2000).optional(),
  systemPrompt: z.string().max(50_000).nullable().optional(),
  presetId: z.string().max(256).nullable().optional(),
  webSearchEnabled: z.boolean().optional(),
  providerId: z.string().min(1).max(256).optional(),
  modelId: z.string().min(1).max(256).optional(),
});

const sendMessagePayloadSchema = z.object({
  conversationId: idSchema,
  text: z.string().max(200_000),
  images: z.array(imageInputSchema).max(16).optional(),
  webSearchOverride: z.boolean().optional(),
});

const retryMessagePayloadSchema = z.object({
  conversationId: idSchema,
  messageId: idSchema,
});

const editMessagePayloadSchema = z.object({
  conversationId: idSchema,
  messageId: idSchema,
  text: z.string().max(200_000),
});

const conversationIdPayloadSchema = z.object({ conversationId: idSchema });

export function registerChatHandlers(ipc: IpcMain) {
  ipc.handle("chat:list", async () => listConversations());

  registerHandler(
    ipc,
    "chat:get",
    conversationIdPayloadSchema,
    async (_event: IpcMainInvokeEvent, payload) =>
      getConversationDetail(payload.conversationId),
  );

  registerHandler(
    ipc,
    "chat:create",
    createPayloadSchema,
    async (_event, payload) => createConversation(payload),
  );

  registerHandler(
    ipc,
    "chat:update",
    updatePayloadSchema,
    async (_event, payload) => updateConversation(payload),
  );

  registerHandler(
    ipc,
    "chat:archive",
    conversationIdPayloadSchema,
    async (_event, payload) => archiveConversationState(payload.conversationId),
  );

  registerHandler(
    ipc,
    "chat:delete",
    conversationIdPayloadSchema,
    async (_event, payload) => {
      stopConversationStream(payload.conversationId);
      await deleteConversationState(payload.conversationId);
      emit({
        type: "conversation.deleted",
        conversationId: payload.conversationId,
      });
      return null;
    },
  );

  registerHandler(
    ipc,
    "chat:sendMessage",
    sendMessagePayloadSchema,
    async (_event, payload) =>
      sendConversationMessage(payload as SendConversationMessagePayload),
  );

  registerHandler(
    ipc,
    "chat:retryMessage",
    retryMessagePayloadSchema,
    async (_event, payload) =>
      retryConversationMessage(payload as RetryConversationMessagePayload),
  );

  registerHandler(
    ipc,
    "chat:editMessage",
    editMessagePayloadSchema,
    async (_event, payload) =>
      editConversationMessage(payload as EditConversationMessagePayload),
  );

  registerHandler(
    ipc,
    "chat:stopStream",
    conversationIdPayloadSchema,
    async (_event, payload) => {
      stopConversationStream(payload.conversationId);
      return null;
    },
  );
}
