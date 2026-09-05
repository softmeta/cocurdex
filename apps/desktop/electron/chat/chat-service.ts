import { requestDaemon } from "@cocurdex/daemon/client";
import {
  type AgentRuntimeProviderConfig,
  type CreateConversationPayload,
  createProviderSnapshotForModel,
  type EditConversationMessagePayload,
  isChatCapableModel,
  isChatSupportedApi,
  type RetryConversationMessagePayload,
  type SendConversationMessagePayload,
  type UpdateConversationPayload,
} from "@cocurdex/shared";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { z } from "zod";
import { idSchema, registerHandler } from "../ipc";
import {
  listConfiguredProviderModels,
  resolveRuntimeProviderSnapshot,
} from "../provider/provider-service";
import {
  chatDaemonOptions,
  getProviderConfig,
  getTitleModelSetting,
} from "./app-state";

async function resolveChatProvider(
  providerId: string,
  modelId: string,
): Promise<AgentRuntimeProviderConfig> {
  const provider = await getProviderConfig(providerId);
  if (!provider?.enabled)
    throw new Error("Provider is unavailable or disabled");
  const model = (await listConfiguredProviderModels([provider])).find(
    (candidate) =>
      candidate.providerId === providerId && candidate.modelId === modelId,
  );
  if (
    !model?.enabled ||
    !isChatSupportedApi(model.api) ||
    !isChatCapableModel(model.capabilities)
  ) {
    throw new Error("The selected model is unavailable for chat");
  }
  return resolveRuntimeProviderSnapshot(
    createProviderSnapshotForModel({ provider, model }),
  );
}

async function resolveConversationProvider(conversationId: string) {
  const snapshot = await getConversationDetail(conversationId);
  if (!snapshot) throw new Error("Conversation not found");
  return resolveChatProvider(
    snapshot.conversation.providerId,
    snapshot.conversation.modelId,
  );
}

async function getConversationDetail(conversationId: string) {
  return requestDaemon(
    "chat.get",
    { conversationId },
    await chatDaemonOptions(),
  );
}

async function createConversation(payload: CreateConversationPayload) {
  await resolveChatProvider(payload.providerId, payload.modelId);
  return requestDaemon("chat.create", payload, await chatDaemonOptions());
}

async function updateConversation(payload: UpdateConversationPayload) {
  return requestDaemon("chat.update", payload, await chatDaemonOptions());
}

async function sendConversationMessage(
  payload: SendConversationMessagePayload,
) {
  const providerConfig = await resolveConversationProvider(
    payload.conversationId,
  );
  let titleProviderConfig: AgentRuntimeProviderConfig | null = null;
  try {
    const selection = await getTitleModelSetting();
    if (selection)
      titleProviderConfig = await resolveChatProvider(
        selection.providerId,
        selection.modelId,
      );
  } catch (error) {
    console.warn("[Chat] Dedicated title model unavailable", error);
  }
  return requestDaemon(
    "chat.send",
    { message: payload, providerConfig, titleProviderConfig },
    await chatDaemonOptions(),
  );
}

async function retryConversationMessage(
  payload: RetryConversationMessagePayload,
) {
  const providerConfig = await resolveConversationProvider(
    payload.conversationId,
  );
  return requestDaemon(
    "chat.retry",
    { message: payload, providerConfig },
    await chatDaemonOptions(),
  );
}

async function editConversationMessage(
  payload: EditConversationMessagePayload,
) {
  const providerConfig = await resolveConversationProvider(
    payload.conversationId,
  );
  return requestDaemon(
    "chat.edit",
    { message: payload, providerConfig },
    await chatDaemonOptions(),
  );
}

const imageInputSchema = z.object({
  id: z.string().min(1).max(256),
  name: z.string().min(1).max(1024),
  mimeType: z.string().min(1).max(255),
  sizeBytes: z.number().int().nonnegative(),
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
  ipc.handle("chat:list", async () =>
    requestDaemon("chat.list", await chatDaemonOptions()),
  );

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
    async (_event, payload) =>
      requestDaemon("chat.archive", payload, await chatDaemonOptions()),
  );

  registerHandler(
    ipc,
    "chat:delete",
    conversationIdPayloadSchema,
    async (_event, payload) => {
      return requestDaemon("chat.delete", payload, await chatDaemonOptions());
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
      return requestDaemon("chat.stop", payload, await chatDaemonOptions());
    },
  );
}
