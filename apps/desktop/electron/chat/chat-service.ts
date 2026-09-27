import { requestDaemon } from "@cocurdex/daemon/client";
import type { SendConversationMessagePayload } from "@cocurdex/shared";
import type { IpcMain } from "electron";
import { z } from "zod";
import { idSchema, registerHandler } from "../ipc";
import { chatDaemonOptions } from "./app-state";

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
    async (_event, payload) =>
      requestDaemon("chat.get", payload, await chatDaemonOptions()),
  );

  registerHandler(
    ipc,
    "chat:create",
    createPayloadSchema,
    async (_event, payload) =>
      requestDaemon("chat.create", payload, await chatDaemonOptions()),
  );

  registerHandler(
    ipc,
    "chat:update",
    updatePayloadSchema,
    async (_event, payload) =>
      requestDaemon("chat.update", payload, await chatDaemonOptions()),
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
      requestDaemon(
        "chat.send",
        payload as SendConversationMessagePayload,
        await chatDaemonOptions(),
      ),
  );

  registerHandler(
    ipc,
    "chat:retryMessage",
    retryMessagePayloadSchema,
    async (_event, payload) =>
      requestDaemon("chat.retry", payload, await chatDaemonOptions()),
  );

  registerHandler(
    ipc,
    "chat:editMessage",
    editMessagePayloadSchema,
    async (_event, payload) =>
      requestDaemon("chat.edit", payload, await chatDaemonOptions()),
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
