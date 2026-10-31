import { deckContentSchema, deckOpsSchema } from "@cocurdex/deck";
import {
  type CheckDeckPayload,
  type CreateDeckDownloadPayload,
  type CreateDeckPayload,
  DECK_EXPORT_FORMATS,
  type DeleteDeckPayload,
  type EditDeckPayload,
  type ExportDeckFilePayload,
  type GetDeckPayload,
  type ImportDeckImagePayload,
  type ImportDeckPayload,
  type ReadPptxPayload,
  type UpdateDeckPayload,
} from "@cocurdex/shared";
import { z } from "zod";
import type { PayloadSchemas } from "./primitives";

const idSchema = z.string().min(1).max(256);
const titleSchema = z.string().max(512);
const markdownSchema = z.string().max(2_000_000);
const revisionSchema = z.number().int().positive().optional();
const formatSchema = z.enum(DECK_EXPORT_FORMATS);

const byId = z.object({ id: idSchema });

const createDeck = z.object({
  title: titleSchema.optional(),
  workspaceId: idSchema.nullable().optional(),
  content: deckContentSchema.optional(),
  markdown: markdownSchema.optional(),
}) satisfies z.ZodType<CreateDeckPayload>;

const updateDeck = z.object({
  id: idSchema,
  title: titleSchema.optional(),
  workspaceId: idSchema.nullable().optional(),
  content: deckContentSchema.optional(),
  markdown: markdownSchema.optional(),
  expectedRevision: revisionSchema,
}) satisfies z.ZodType<UpdateDeckPayload>;

const editDeck = z.object({
  id: idSchema,
  ops: deckOpsSchema,
  expectedRevision: revisionSchema,
}) satisfies z.ZodType<EditDeckPayload>;

const deleteDeck = z.object({
  id: idSchema,
  expectedRevision: revisionSchema,
}) satisfies z.ZodType<DeleteDeckPayload>;

const createDownload = z.object({
  id: idSchema,
  format: formatSchema,
}) satisfies z.ZodType<CreateDeckDownloadPayload>;

const exportFile = z.object({
  id: idSchema,
  format: formatSchema,
  outputPath: z.string().min(1).max(4096),
}) satisfies z.ZodType<ExportDeckFilePayload>;

const importImage = z.object({
  path: z.string().min(1).max(4096),
}) satisfies z.ZodType<ImportDeckImagePayload>;

const importDeck = z.object({
  path: z.string().min(1).max(4096),
  title: titleSchema.optional(),
  workspaceId: idSchema.nullable().optional(),
}) satisfies z.ZodType<ImportDeckPayload>;

const readPptx = z.object({
  path: z.string().min(1).max(4096),
}) satisfies z.ZodType<ReadPptxPayload>;

export const deckPayloadSchemas = {
  "deck.get": byId satisfies z.ZodType<GetDeckPayload>,
  "deck.create": createDeck,
  "deck.update": updateDeck,
  "deck.edit": editDeck,
  "deck.delete": deleteDeck,
  "deck.check": byId satisfies z.ZodType<CheckDeckPayload>,
  "deck.createDownload": createDownload,
  "deck.exportFile": exportFile,
  "deck.importImage": importImage,
  "deck.import": importDeck,
  "deck.readPptx": readPptx,
} satisfies PayloadSchemas;
