import {
  type AgentId,
  type CommentIssuePayload,
  type CreateColumnPayload,
  type CreateIssueLabelPayload,
  type CreateIssuePayload,
  type CreateNotePayload,
  type CreateViewPayload,
  type DeleteColumnPayload,
  type DeleteIssueLabelPayload,
  type DeleteIssuePayload,
  type DeleteNotePayload,
  type DeleteViewPayload,
  type GetIssueDetailPayload,
  type GetIssuePayload,
  type GetNotePayload,
  ISSUE_RELATION_KINDS,
  ISSUE_STATUS_CATEGORIES,
  type IssueRelationPayload,
  isAgentId,
  type LoadViewPayload,
  type MoveColumnPayload,
  type MoveIssuePayload,
  type MoveNotePayload,
  type SaveWorkflowDefinitionPayload,
  type SearchDocumentsPayload,
  type UpdateColumnPayload,
  type UpdateIssueLabelPayload,
  type UpdateIssuePayload,
  type UpdateNotePayload,
  type UpdateViewPayload,
} from "@cocurdex/shared";
import { z } from "zod";

const idSchema = z.uuid();
const viewIdSchema = z.union([z.literal("project"), idSchema]);
const columnIdSchema = z.string().min(1).max(128);
const issueFieldSchema = z.enum(["status", "priority"]);
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
  field: z.enum(["workspaceId", "labelId", "priority", "statusCategory"]),
  op: z.enum(["eq", "neq", "is_null"]),
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

const statusCategorySchema = z.enum(ISSUE_STATUS_CATEGORIES);
const issueActorSchema = z.object({
  kind: z.enum(["user", "cli", "session"]),
  sessionId: z.string().min(1).max(128).nullable().optional(),
});
const labelIdsSchema = z.array(idSchema).max(64);

export const createColumnPayloadSchema = z.object({
  field: issueFieldSchema,
  title: titleSchema.optional(),
  color: z.string().max(64).nullable().optional(),
  category: statusCategorySchema.optional(),
  sortOrder: z.number().finite().optional(),
}) satisfies z.ZodType<CreateColumnPayload>;

export const updateColumnPayloadSchema = z.object({
  field: issueFieldSchema,
  id: columnIdSchema,
  title: titleSchema.optional(),
  color: z.string().max(64).nullable().optional(),
  category: statusCategorySchema.optional(),
}) satisfies z.ZodType<UpdateColumnPayload>;

export const moveColumnPayloadSchema = z.object({
  field: issueFieldSchema,
  id: columnIdSchema,
  sortOrder: z.number().finite(),
}) satisfies z.ZodType<MoveColumnPayload>;

export const deleteColumnPayloadSchema = z.object({
  field: issueFieldSchema,
  id: columnIdSchema,
}) satisfies z.ZodType<DeleteColumnPayload>;

export const createIssuePayloadSchema = z.object({
  viewId: viewIdSchema,
  columnId: columnIdSchema.optional(),
  title: titleSchema.optional(),
  description: z.string().max(2_000_000).nullable().optional(),
  color: z.string().max(64).nullable().optional(),
  status: columnIdSchema.optional(),
  priority: columnIdSchema.optional(),
  workspaceId: idSchema.nullable().optional(),
  parentId: idSchema.nullable().optional(),
  labelIds: labelIdsSchema.optional(),
  sortOrder: z.number().finite().optional(),
  actor: issueActorSchema.optional(),
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
  parentId: idSchema.nullable().optional(),
  labelIds: labelIdsSchema.optional(),
  expectedRevision: revisionSchema,
  actor: issueActorSchema.optional(),
}) satisfies z.ZodType<UpdateIssuePayload>;

export const moveIssuePayloadSchema = z.object({
  viewId: viewIdSchema,
  id: idSchema,
  columnId: columnIdSchema,
  sortOrder: z.number().finite(),
  expectedRevision: revisionSchema,
  actor: issueActorSchema.optional(),
}) satisfies z.ZodType<MoveIssuePayload>;

export const deleteIssuePayloadSchema = z.object({
  id: idSchema,
  expectedRevision: revisionSchema,
}) satisfies z.ZodType<DeleteIssuePayload>;

export const getIssueDetailPayloadSchema = z.object({
  id: idSchema,
  viewId: viewIdSchema.optional(),
}) satisfies z.ZodType<GetIssueDetailPayload>;

const labelNameSchema = z.string().trim().min(1).max(64);
const labelColorSchema = z.string().max(64).nullable().optional();

export const createIssueLabelPayloadSchema = z.object({
  name: labelNameSchema,
  color: labelColorSchema,
}) satisfies z.ZodType<CreateIssueLabelPayload>;

export const updateIssueLabelPayloadSchema = z.object({
  id: idSchema,
  name: labelNameSchema.optional(),
  color: labelColorSchema,
}) satisfies z.ZodType<UpdateIssueLabelPayload>;

export const deleteIssueLabelPayloadSchema = z.object({
  id: idSchema,
}) satisfies z.ZodType<DeleteIssueLabelPayload>;

export const issueRelationPayloadSchema = z.object({
  id: idSchema,
  kind: z.enum(ISSUE_RELATION_KINDS),
  relatedId: idSchema,
  actor: issueActorSchema.optional(),
}) satisfies z.ZodType<IssueRelationPayload>;

export const commentIssuePayloadSchema = z.object({
  id: idSchema,
  body: z.string().trim().min(1).max(200_000),
  actor: issueActorSchema.optional(),
}) satisfies z.ZodType<CommentIssuePayload>;

const workflowDefinitionIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_.:@-]+$/);

const workflowStepSchema = z.object({
  id: workflowDefinitionIdSchema,
  kind: z.enum(["agent", "gate", "validation"]),
  role: z.enum(["planner", "implementer", "reviewer"]).optional(),
  permissionProfile: z.enum(["read_only", "workspace_write", "validation"]),
  instruction: z.string().max(8_000).optional(),
  inputSchemas: z.array(
    z.enum([
      "plan_artifact.v1",
      "change_set.v1",
      "validation_report.v1",
      "review_decision.v1",
    ]),
  ),
  outputSchema: z
    .enum([
      "plan_artifact.v1",
      "change_set.v1",
      "validation_report.v1",
      "review_decision.v1",
    ])
    .optional(),
  maxAttempts: z.number().int().min(1).max(20),
});

const workflowTransitionSchema = z.object({
  from: workflowDefinitionIdSchema,
  outcome: z.enum([
    "completed",
    "approved",
    "rejected",
    "passed",
    "failed",
    "accepted",
    "changes_requested",
    "blocked",
  ]),
  to: workflowDefinitionIdSchema.optional(),
  terminalStatus: z
    .enum(["completed", "failed", "cancelled", "blocked", "exhausted"])
    .optional(),
  maxTraversals: z.number().int().min(1).max(20).optional(),
});

const workflowExecutorBindingSchema = z.object({
  agentId: z
    .string()
    .max(80)
    .refine(isAgentId, "unknown agent")
    .transform((value) => value as AgentId),
  agentRoleId: z.string().min(1).max(128).optional(),
  model: z.string().max(256).optional(),
  permissionProfile: z.enum(["read_only", "workspace_write", "validation"]),
});

export const workflowDefinitionIdPayloadSchema = z.object({
  definitionId: workflowDefinitionIdSchema,
});

export const saveWorkflowDefinitionPayloadSchema = z.object({
  id: workflowDefinitionIdSchema,
  name: z.string().min(1).max(200),
  revision: z.object({
    definitionId: workflowDefinitionIdSchema,
    version: z.number().int().min(1),
    initialStepId: workflowDefinitionIdSchema,
    steps: z.array(workflowStepSchema).min(1).max(40),
    transitions: z.array(workflowTransitionSchema).max(80),
  }),
  layout: z.object({
    nodes: z.record(
      z.string(),
      z.object({
        x: z.number().finite(),
        y: z.number().finite(),
      }),
    ),
  }),
  defaultBindings: z
    .object({
      planner: workflowExecutorBindingSchema,
      implementer: workflowExecutorBindingSchema,
      reviewer: workflowExecutorBindingSchema,
    })
    .nullable(),
}) satisfies z.ZodType<SaveWorkflowDefinitionPayload>;

export const searchDocumentsPayloadSchema = z.object({
  query: z.string().max(2_000),
  kinds: z
    .array(z.enum(["note", "issue"]))
    .max(2)
    .optional(),
  workspaceId: idSchema.nullable().optional(),
  limit: z.number().int().min(1).max(200).optional(),
}) satisfies z.ZodType<SearchDocumentsPayload>;
