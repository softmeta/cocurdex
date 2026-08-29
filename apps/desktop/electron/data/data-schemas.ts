import type {
  CreateColumnPayload,
  CreateIssuePayload,
  CreateNotePayload,
  CreateViewPayload,
  DeleteColumnPayload,
  DeleteIssuePayload,
  DeleteNotePayload,
  DeleteViewPayload,
  GetIssuePayload,
  GetNotePayload,
  LoadViewPayload,
  MoveColumnPayload,
  MoveIssuePayload,
  MoveNotePayload,
  RenameNotePayload,
  SearchDocumentsPayload,
  UpdateColumnPayload,
  UpdateIssuePayload,
  UpdateNotePayload,
  UpdateViewPayload,
} from "@cocurdex/shared";
import { z } from "zod";

const idSchema = z.uuid();
const viewIdSchema = z.union([z.literal("project"), idSchema]);
const columnIdSchema = z.string().min(1).max(128);
const titleSchema = z.string().max(512);
const revisionSchema = z.number().int().positive().optional();

export const getNotePayloadSchema = z.object({
  id: idSchema,
}) satisfies z.ZodType<GetNotePayload>;

export const createNotePayloadSchema = z.object({
  parentId: idSchema.nullable().optional(),
  workspaceId: idSchema.nullable().optional(),
  kind: z.enum(["note", "folder"]).optional(),
  title: titleSchema.optional(),
  icon: z.string().max(64).nullable().optional(),
  sortOrder: z.number().finite().optional(),
}) satisfies z.ZodType<CreateNotePayload>;

export const updateNotePayloadSchema = z.object({
  id: idSchema,
  bodyMarkdown: z.string().max(2_000_000).optional(),
  title: titleSchema.optional(),
  icon: z.string().max(64).nullable().optional(),
  workspaceId: idSchema.nullable().optional(),
  expectedRevision: revisionSchema,
}) satisfies z.ZodType<UpdateNotePayload>;

export const renameNotePayloadSchema = z.object({
  id: idSchema,
  title: titleSchema,
  expectedRevision: revisionSchema,
}) satisfies z.ZodType<RenameNotePayload>;

export const moveNotePayloadSchema = z.object({
  id: idSchema,
  parentId: idSchema.nullable(),
  sortOrder: z.number().finite().optional(),
  expectedRevision: revisionSchema,
}) satisfies z.ZodType<MoveNotePayload>;

export const deleteNotePayloadSchema = z.object({
  id: idSchema,
  expectedRevision: revisionSchema,
}) satisfies z.ZodType<DeleteNotePayload>;

export const loadViewPayloadSchema = z.object({
  viewId: viewIdSchema.optional(),
}) satisfies z.ZodType<LoadViewPayload>;

export const getIssuePayloadSchema = z.object({
  id: idSchema,
  viewId: viewIdSchema.optional(),
}) satisfies z.ZodType<GetIssuePayload>;

export const createViewPayloadSchema = z.object({
  title: titleSchema.optional(),
  icon: z.string().max(64).nullable().optional(),
}) satisfies z.ZodType<CreateViewPayload>;

export const deleteViewPayloadSchema = z.object({
  viewId: viewIdSchema,
  expectedRevision: revisionSchema,
}) satisfies z.ZodType<DeleteViewPayload>;

const viewFilterSchema = z.object({
  field: z.literal("workspaceId"),
  op: z.enum(["eq", "is_null"]),
  value: z.string().min(1).max(128).optional(),
});

export const updateViewPayloadSchema = z.object({
  viewId: viewIdSchema,
  title: titleSchema.optional(),
  icon: z.string().max(64).nullable().optional(),
  groupBy: z.enum(["status", "priority"]).optional(),
  layout: z.enum(["board", "list"]).optional(),
  filters: z.array(viewFilterSchema).max(32).optional(),
  expectedRevision: revisionSchema,
}) satisfies z.ZodType<UpdateViewPayload>;

export const createColumnPayloadSchema = z.object({
  viewId: viewIdSchema,
  title: titleSchema.optional(),
  color: z.string().max(64).nullable().optional(),
  sortOrder: z.number().finite().optional(),
}) satisfies z.ZodType<CreateColumnPayload>;

export const updateColumnPayloadSchema = z.object({
  viewId: viewIdSchema,
  id: columnIdSchema,
  title: titleSchema.optional(),
  color: z.string().max(64).nullable().optional(),
}) satisfies z.ZodType<UpdateColumnPayload>;

export const moveColumnPayloadSchema = z.object({
  viewId: viewIdSchema,
  id: columnIdSchema,
  sortOrder: z.number().finite(),
}) satisfies z.ZodType<MoveColumnPayload>;

export const deleteColumnPayloadSchema = z.object({
  viewId: viewIdSchema,
  id: columnIdSchema,
}) satisfies z.ZodType<DeleteColumnPayload>;

export const createIssuePayloadSchema = z.object({
  viewId: viewIdSchema,
  columnId: columnIdSchema,
  title: titleSchema.optional(),
  description: z.string().max(2_000_000).nullable().optional(),
  color: z.string().max(64).nullable().optional(),
  status: columnIdSchema.optional(),
  priority: columnIdSchema.optional(),
  workspaceId: idSchema.nullable().optional(),
  sortOrder: z.number().finite().optional(),
}) satisfies z.ZodType<CreateIssuePayload>;

export const updateIssuePayloadSchema = z.object({
  viewId: viewIdSchema,
  id: idSchema,
  title: titleSchema.optional(),
  description: z.string().max(2_000_000).nullable().optional(),
  color: z.string().max(64).nullable().optional(),
  status: columnIdSchema.optional(),
  priority: columnIdSchema.optional(),
  workspaceId: idSchema.nullable().optional(),
  expectedRevision: revisionSchema,
}) satisfies z.ZodType<UpdateIssuePayload>;

export const moveIssuePayloadSchema = z.object({
  viewId: viewIdSchema,
  id: idSchema,
  columnId: columnIdSchema,
  sortOrder: z.number().finite(),
  expectedRevision: revisionSchema,
}) satisfies z.ZodType<MoveIssuePayload>;

export const deleteIssuePayloadSchema = z.object({
  id: idSchema,
  expectedRevision: revisionSchema,
}) satisfies z.ZodType<DeleteIssuePayload>;

export const searchDocumentsPayloadSchema = z.object({
  query: z.string().max(2_000),
  kinds: z
    .array(z.enum(["note", "issue"]))
    .max(2)
    .optional(),
  workspaceId: idSchema.nullable().optional(),
  limit: z.number().int().min(1).max(200).optional(),
}) satisfies z.ZodType<SearchDocumentsPayload>;
