import type {
  ApplyNoteDocUpdatePayload,
  CreateNotePayload,
  DeleteNotePayload,
  GetNoteDocPayload,
  GetNotePayload,
  MoveNotePayload,
  UpdateNotePayload,
} from "@cocurdex/shared";
import { z } from "zod";
import type { PayloadSchemas } from "./primitives";

const idSchema = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value !== "." && value !== ".." && !/[/\\]/.test(value));
const titleSchema = z.string().max(512);
const iconSchema = z.string().max(64).nullable();
const bodySchema = z.string().max(2_000_000);
const revisionSchema = z.number().int().positive().optional();
const noteDocBytesSchema = z.string().max(16_000_000).base64();

const getNote = z.object({ id: idSchema }) satisfies z.ZodType<GetNotePayload>;

const getNoteDoc = z.object({
  id: idSchema,
  stateVector: noteDocBytesSchema.optional(),
}) satisfies z.ZodType<GetNoteDocPayload>;

const applyNoteDocUpdate = z.object({
  id: idSchema,
  update: noteDocBytesSchema,
}) satisfies z.ZodType<ApplyNoteDocUpdatePayload>;

const createNote = z.object({
  parentId: idSchema.nullable().optional(),
  workspaceId: idSchema.nullable().optional(),
  kind: z.enum(["note", "folder"]).optional(),
  title: titleSchema.optional(),
  bodyMarkdown: bodySchema.optional(),
  icon: iconSchema.optional(),
  sortOrder: z.number().finite().optional(),
}) satisfies z.ZodType<CreateNotePayload>;

const updateNote = z.object({
  id: idSchema,
  bodyMarkdown: bodySchema.optional(),
  title: titleSchema.optional(),
  icon: iconSchema.optional(),
  workspaceId: idSchema.nullable().optional(),
  expectedRevision: revisionSchema,
}) satisfies z.ZodType<UpdateNotePayload>;

const moveNote = z.object({
  id: idSchema,
  parentId: idSchema.nullable(),
  workspaceId: idSchema.nullable().optional(),
  sortOrder: z.number().finite().optional(),
  expectedRevision: revisionSchema,
}) satisfies z.ZodType<MoveNotePayload>;

const deleteNote = z.object({
  id: idSchema,
  expectedRevision: revisionSchema,
}) satisfies z.ZodType<DeleteNotePayload>;

export const notePayloadSchemas = {
  "note.get": getNote,
  "note.getDoc": getNoteDoc,
  "note.applyDocUpdate": applyNoteDocUpdate,
  "note.create": createNote,
  "note.update": updateNote,
  "note.move": moveNote,
  "note.delete": deleteNote,
} satisfies PayloadSchemas;
