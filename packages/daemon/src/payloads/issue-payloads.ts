import {
  type CommentIssuePayload,
  type CreateColumnPayload,
  type CreateIssueLabelPayload,
  type CreateIssuePayload,
  type CreateViewPayload,
  type DeleteColumnPayload,
  type DeleteIssueLabelPayload,
  type DeleteIssuePayload,
  type DeleteViewPayload,
  type GetIssueDetailPayload,
  type GetIssuePayload,
  ISSUE_DISPLAY_PROPERTIES,
  ISSUE_RELATION_KINDS,
  ISSUE_STATUS_CATEGORIES,
  type IssueRelationPayload,
  type ListColumnsPayload,
  type LoadViewPayload,
  type MoveColumnPayload,
  type MoveIssuePayload,
  type SearchDocumentsPayload,
  type UpdateColumnPayload,
  type UpdateIssueLabelPayload,
  type UpdateIssuePayload,
  type UpdateSessionAttentionPayload,
  type UpdateViewPayload,
  VIEW_FILTER_FIELDS,
  VIEW_FILTER_OPS,
  VIEW_GROUP_BY_FIELDS,
  VIEW_LAYOUTS,
} from "@cocurdex/shared";
import { z } from "zod";
import {
  idSchema,
  isoTimestampSchema,
  noNullByte,
  type PayloadSchemas,
} from "./primitives";

const refSchema = z.string().min(1).max(256).refine(noNullByte, "null byte");
const viewIdSchema = refSchema;
const columnIdSchema = z.string().min(1).max(128);
const issueFieldSchema = z.enum(["status", "priority"]);
const titleSchema = z.string().max(512);
const revisionSchema = z.number().int().positive().optional();

const loadViewPayloadSchema = z.object({
  viewId: viewIdSchema.optional(),
}) satisfies z.ZodType<LoadViewPayload>;

const getIssuePayloadSchema = z.object({
  id: refSchema,
  viewId: viewIdSchema.optional(),
}) satisfies z.ZodType<GetIssuePayload>;

const createViewPayloadSchema = z.object({
  title: titleSchema.optional(),
  icon: z.string().max(64).nullable().optional(),
}) satisfies z.ZodType<CreateViewPayload>;

const deleteViewPayloadSchema = z.object({
  viewId: viewIdSchema,
  expectedRevision: revisionSchema,
}) satisfies z.ZodType<DeleteViewPayload>;

const viewFilterSchema = z.object({
  field: z.enum(VIEW_FILTER_FIELDS),
  op: z.enum(VIEW_FILTER_OPS),
  value: z.string().min(1).max(128).optional(),
});

const updateViewPayloadSchema = z.object({
  viewId: viewIdSchema,
  title: titleSchema.optional(),
  icon: z.string().max(64).nullable().optional(),
  groupBy: z.enum(VIEW_GROUP_BY_FIELDS).optional(),
  layout: z.enum(VIEW_LAYOUTS).optional(),
  filters: z.array(viewFilterSchema).max(32).optional(),
  display: z
    .object({
      properties: z.array(z.enum(ISSUE_DISPLAY_PROPERTIES)).max(32),
      showEmptyGroups: z.boolean(),
    })
    .optional(),
  expectedRevision: revisionSchema,
}) satisfies z.ZodType<UpdateViewPayload>;

const statusCategorySchema = z.enum(ISSUE_STATUS_CATEGORIES);
const issueActorSchema = z.object({
  kind: z.enum(["user", "cli", "session"]),
  sessionId: z.string().min(1).max(128).nullable().optional(),
});
const labelIdsSchema = z.array(refSchema).max(64);

const listColumnsPayloadSchema = z.object({
  field: issueFieldSchema,
}) satisfies z.ZodType<ListColumnsPayload>;

const createColumnPayloadSchema = z.object({
  field: issueFieldSchema,
  title: titleSchema.optional(),
  color: z.string().max(64).nullable().optional(),
  category: statusCategorySchema.optional(),
  sortOrder: z.number().finite().optional(),
}) satisfies z.ZodType<CreateColumnPayload>;

const updateColumnPayloadSchema = z.object({
  field: issueFieldSchema,
  id: columnIdSchema,
  title: titleSchema.optional(),
  color: z.string().max(64).nullable().optional(),
  category: statusCategorySchema.optional(),
}) satisfies z.ZodType<UpdateColumnPayload>;

const moveColumnPayloadSchema = z.object({
  field: issueFieldSchema,
  id: columnIdSchema,
  sortOrder: z.number().finite(),
}) satisfies z.ZodType<MoveColumnPayload>;

const deleteColumnPayloadSchema = z.object({
  field: issueFieldSchema,
  id: columnIdSchema,
}) satisfies z.ZodType<DeleteColumnPayload>;

const createIssuePayloadSchema = z.object({
  viewId: viewIdSchema,
  columnId: columnIdSchema.optional(),
  title: titleSchema.optional(),
  description: z.string().max(2_000_000).nullable().optional(),
  color: z.string().max(64).nullable().optional(),
  status: columnIdSchema.optional(),
  priority: columnIdSchema.optional(),
  workspaceId: idSchema.nullable().optional(),
  parentId: refSchema.nullable().optional(),
  labelIds: labelIdsSchema.optional(),
  sortOrder: z.number().finite().optional(),
  actor: issueActorSchema.optional(),
}) satisfies z.ZodType<CreateIssuePayload>;

const updateIssuePayloadSchema = z.object({
  viewId: viewIdSchema,
  id: refSchema,
  title: titleSchema.optional(),
  description: z.string().max(2_000_000).nullable().optional(),
  color: z.string().max(64).nullable().optional(),
  status: columnIdSchema.optional(),
  priority: columnIdSchema.optional(),
  workspaceId: idSchema.nullable().optional(),
  parentId: refSchema.nullable().optional(),
  labelIds: labelIdsSchema.optional(),
  expectedRevision: revisionSchema,
  actor: issueActorSchema.optional(),
}) satisfies z.ZodType<UpdateIssuePayload>;

const moveIssuePayloadSchema = z.object({
  viewId: viewIdSchema,
  id: refSchema,
  columnId: columnIdSchema,
  fromColumnId: columnIdSchema.optional(),
  sortOrder: z.number().finite(),
  expectedRevision: revisionSchema,
  actor: issueActorSchema.optional(),
}) satisfies z.ZodType<MoveIssuePayload>;

const deleteIssuePayloadSchema = z.object({
  id: refSchema,
  expectedRevision: revisionSchema,
}) satisfies z.ZodType<DeleteIssuePayload>;

const getIssueDetailPayloadSchema = z.object({
  id: refSchema,
  viewId: viewIdSchema.optional(),
}) satisfies z.ZodType<GetIssueDetailPayload>;

const labelNameSchema = z.string().trim().min(1).max(64);
const labelColorSchema = z.string().max(64).nullable().optional();

const createIssueLabelPayloadSchema = z.object({
  name: labelNameSchema,
  color: labelColorSchema,
}) satisfies z.ZodType<CreateIssueLabelPayload>;

const updateIssueLabelPayloadSchema = z.object({
  id: refSchema,
  name: labelNameSchema.optional(),
  color: labelColorSchema,
}) satisfies z.ZodType<UpdateIssueLabelPayload>;

const deleteIssueLabelPayloadSchema = z.object({
  id: refSchema,
}) satisfies z.ZodType<DeleteIssueLabelPayload>;

const issueRelationPayloadSchema = z.object({
  id: refSchema,
  kind: z.enum(ISSUE_RELATION_KINDS),
  relatedId: refSchema,
  actor: issueActorSchema.optional(),
}) satisfies z.ZodType<IssueRelationPayload>;

const commentIssuePayloadSchema = z.object({
  id: refSchema,
  body: z.string().trim().min(1).max(200_000),
  actor: issueActorSchema.optional(),
}) satisfies z.ZodType<CommentIssuePayload>;

const searchDocumentsPayloadSchema = z.object({
  query: z.string().max(2_000),
  kinds: z
    .array(z.enum(["note", "issue"]))
    .max(2)
    .optional(),
  workspaceId: idSchema.nullable().optional(),
  limit: z.number().int().min(1).max(200).optional(),
}) satisfies z.ZodType<SearchDocumentsPayload>;

const updateSessionAttentionPayloadSchema = z.object({
  sessionId: idSchema,
  action: z.enum(["visited", "mark-unread", "settle", "unsettle"]),
  at: isoTimestampSchema,
}) satisfies z.ZodType<UpdateSessionAttentionPayload>;

export const issuePayloadSchemas = {
  "issue.loadView": loadViewPayloadSchema,
  "issue.createView": createViewPayloadSchema,
  "issue.updateView": updateViewPayloadSchema,
  "issue.deleteView": deleteViewPayloadSchema,
  "issue.createColumn": createColumnPayloadSchema,
  "issue.listColumns": listColumnsPayloadSchema,
  "issue.updateColumn": updateColumnPayloadSchema,
  "issue.moveColumn": moveColumnPayloadSchema,
  "issue.deleteColumn": deleteColumnPayloadSchema,
  "issue.get": getIssuePayloadSchema,
  "issue.create": createIssuePayloadSchema,
  "issue.update": updateIssuePayloadSchema,
  "issue.move": moveIssuePayloadSchema,
  "issue.delete": deleteIssuePayloadSchema,
  "issue.getDetail": getIssueDetailPayloadSchema,
  "issue.createLabel": createIssueLabelPayloadSchema,
  "issue.updateLabel": updateIssueLabelPayloadSchema,
  "issue.deleteLabel": deleteIssueLabelPayloadSchema,
  "issue.addRelation": issueRelationPayloadSchema,
  "issue.removeRelation": issueRelationPayloadSchema,
  "issue.comment": commentIssuePayloadSchema,
  "search.documents": searchDocumentsPayloadSchema,
  "attention.update": updateSessionAttentionPayloadSchema,
} satisfies PayloadSchemas;
