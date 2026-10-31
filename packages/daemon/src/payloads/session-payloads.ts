import {
  AGENT_ROLE_AVATAR_COLORS,
  type AgentPermissionMode,
  reasoningEfforts,
  SCRIPT_RUN_HARD_MAX_AGENTS,
  SCRIPT_RUN_MAX_SCHEMA_ATTEMPTS,
  TEAM_MAX_MEMBERS,
  TEAM_MIN_MEMBERS,
} from "@cocurdex/shared";
import { z } from "zod";
import {
  acpRegistryAgentIdSchema,
  agentIdSchema,
  boundedTextSchema,
  exact,
  filesystemPathSchema,
  idSchema,
  loose,
  type Payload,
  type PayloadSchemas,
  providerRequestIdSchema,
  sessionIdPayload,
  toolCallIdSchema,
} from "./primitives";

const sessionMessagePayload = z.object({
  sessionId: idSchema,
  messageId: idSchema,
});

const sessionIdsPayload = z.object({
  sessionIds: z.array(idSchema).max(5000),
});

const MAX_EXECUTION_TREE_DEPTH = 8;

const runIdPayload = z.object({ runId: idSchema });

const maxAgentsSchema = z.number().int().min(1).max(SCRIPT_RUN_HARD_MAX_AGENTS);

const agentRoleAvatarSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("emoji"),
    emoji: z.string().min(1).max(32),
    color: z.enum(AGENT_ROLE_AVATAR_COLORS),
  }),
  z.object({
    kind: z.literal("initial"),
    color: z.enum(AGENT_ROLE_AVATAR_COLORS),
  }),
]);

const runtimeSelectionSchema = z.object({
  reasoningEffort: z.enum(reasoningEfforts).nullish(),
  serviceTier: z.string().max(256).nullish(),
  fastMode: z.boolean().nullish(),
  thinkingLevel: z.enum(["default", "off", ...reasoningEfforts]).nullish(),
  openCodeAgent: z.string().max(256).nullish(),
  openCodeVariant: z.string().max(256).nullish(),
});

const modelSelectionSchema = z.object({
  providerId: idSchema,
  modelId: z.string().min(1).max(512),
});

const createSessionPayload = z.object({
  workspaceId: idSchema,
  agentType: agentIdSchema.optional(),
  model: z
    .object({ providerId: idSchema, modelId: z.string().min(1).max(512) })
    .nullable()
    .optional(),
  permissionMode: z
    .custom<AgentPermissionMode>((value) => idSchema.safeParse(value).success)
    .nullable()
    .optional(),
  agentRoleId: idSchema.nullable().optional(),
  title: z.string().max(200).optional(),
  runtime: runtimeSelectionSchema.optional(),
});

export const sessionPayloadSchemas = {
  "sync.pull": exact<Payload<"sync.pull">>()(
    z.object({
      sessionIds: z.array(idSchema).max(500),
      hydratedSessionIds: z.array(idSchema).max(500).optional(),
      cursor: z.string().max(128).nullable().optional(),
    }),
  ),
  "session.snapshot": exact<Payload<"session.snapshot">>()(sessionIdPayload),
  "session.fork": exact<Payload<"session.fork">>()(
    z.object({
      sessionId: idSchema,
      throughMessageId: idSchema.optional(),
      title: boundedTextSchema(500).optional(),
    }),
  ),
  "session.switchAgent": exact<Payload<"session.switchAgent">>()(
    z.object({ sessionId: idSchema, agentType: agentIdSchema }),
  ),
  "session.contextTransfers":
    exact<Payload<"session.contextTransfers">>()(sessionIdPayload),
  "session.executionTree": exact<Payload<"session.executionTree">>()(
    z.object({
      sessionId: idSchema,
      maxDepth: z
        .number()
        .int()
        .min(1)
        .max(MAX_EXECUTION_TREE_DEPTH)
        .optional(),
    }),
  ),
  "session.get": exact<Payload<"session.get">>()(sessionIdPayload),
  "session.runtimeState":
    exact<Payload<"session.runtimeState">>()(sessionIdPayload),
  "session.configure": loose<Payload<"session.configure">>()(
    z.looseObject({ id: idSchema, workspaceId: idSchema }),
  ),
  "session.create": exact<Payload<"session.create">>()(createSessionPayload),
  "session.resolveNew":
    exact<Payload<"session.resolveNew">>()(createSessionPayload),
  "session.delete": exact<Payload<"session.delete">>()(sessionIdPayload),
  "session.archive": exact<Payload<"session.archive">>()(sessionIdPayload),
  "session.restore": exact<Payload<"session.restore">>()(sessionIdPayload),
  "session.archiveMany":
    exact<Payload<"session.archiveMany">>()(sessionIdsPayload),
  "session.restoreMany":
    exact<Payload<"session.restoreMany">>()(sessionIdsPayload),
  "session.stop": exact<Payload<"session.stop">>()(sessionIdPayload),
  "session.resumeQueued":
    exact<Payload<"session.resumeQueued">>()(sessionIdPayload),
  "session.listMessages":
    exact<Payload<"session.listMessages">>()(sessionIdPayload),
  "session.listToolCalls":
    exact<Payload<"session.listToolCalls">>()(sessionIdPayload),
  "session.listTurnChangeSets":
    exact<Payload<"session.listTurnChangeSets">>()(sessionIdPayload),
  "session.updateTitle": exact<Payload<"session.updateTitle">>()(
    z.object({
      sessionId: idSchema,
      title: z.string().min(1).max(2000),
      expectedTitle: z.string().max(2000).nullish(),
      updatedAt: z.string().max(64).optional(),
    }),
  ),
  "session.setPinned": exact<Payload<"session.setPinned">>()(
    z.object({ sessionId: idSchema, pinned: z.boolean() }),
  ),
  "session.refineTitle": exact<Payload<"session.refineTitle">>()(
    z.object({
      sessionId: idSchema,
      expectedTitle: z.string().max(2000),
      fallbackTitle: z.string().max(2000),
      message: z.string().max(200_000),
    }),
  ),
  "session.listSlashCommands": exact<Payload<"session.listSlashCommands">>()(
    z.object({
      agentType: agentIdSchema,
      workspaceRootPath: filesystemPathSchema,
    }),
  ),
  "session.updateQueued": exact<Payload<"session.updateQueued">>()(
    z.object({
      sessionId: idSchema,
      messageId: idSchema,
      content: z.string().max(200_000),
    }),
  ),
  "session.deleteQueued": exact<Payload<"session.deleteQueued">>()(
    sessionMessagePayload,
  ),
  "session.steerQueued": exact<Payload<"session.steerQueued">>()(
    sessionMessagePayload,
  ),
  "session.sendQueuedNow": exact<Payload<"session.sendQueuedNow">>()(
    sessionMessagePayload,
  ),
  "session.setConfig": exact<Payload<"session.setConfig">>()(
    z.object({
      sessionId: idSchema,
      configId: idSchema,
      value: z.union([z.boolean(), z.string().max(4096)]),
    }),
  ),
  "session.setMode": exact<Payload<"session.setMode">>()(
    z.object({ sessionId: idSchema, modeId: idSchema }),
  ),
  "session.updateRuntime": exact<Payload<"session.updateRuntime">>()(
    z.object({
      sessionId: idSchema,
      model: modelSelectionSchema.optional(),
      runtime: runtimeSelectionSchema.optional(),
    }),
  ),
  "session.undoTurnChanges": exact<Payload<"session.undoTurnChanges">>()(
    sessionMessagePayload,
  ),
  "session.getTurnChangeFile": exact<Payload<"session.getTurnChangeFile">>()(
    z.object({
      sessionId: idSchema,
      messageId: idSchema,
      path: z.string().min(1).max(4096),
      side: z.enum(["before", "after"]),
    }),
  ),
  "session.getTurnChangeDiff": exact<Payload<"session.getTurnChangeDiff">>()(
    sessionMessagePayload,
  ),
  "session.getToolCallResult": exact<Payload<"session.getToolCallResult">>()(
    z.object({ toolCallId: toolCallIdSchema }),
  ),
  "permission.resolve": exact<Payload<"permission.resolve">>()(
    z.object({
      requestId: providerRequestIdSchema,
      optionId: z
        .string()
        .min(1)
        .max(256)
        .refine((v) => !v.includes("\0")),
    }),
  ),
  "question.resolve": exact<Payload<"question.resolve">>()(
    z.object({
      questionId: providerRequestIdSchema,
      answer: z.string().max(64_000),
    }),
  ),
  "planApproval.resolve": exact<Payload<"planApproval.resolve">>()(
    z.object({
      approvalId: providerRequestIdSchema,
      decision: z.object({
        outcome: z.enum(["approved", "cancelled", "abandoned"]),
        feedback: z.string().max(64_000).nullish(),
      }),
    }),
  ),
  "team.get": exact<Payload<"team.get">>()(
    z.object({ leadSessionId: idSchema }),
  ),
  "team.create": exact<Payload<"team.create">>()(
    z.object({ leadSessionId: idSchema, templateId: idSchema }),
  ),
  "team.stop": exact<Payload<"team.stop">>()(z.object({ teamId: idSchema })),
  "team.stopMember": exact<Payload<"team.stopMember">>()(
    z.object({ teamId: idSchema, sessionId: idSchema }),
  ),
  "teamTemplate.save": exact<Payload<"teamTemplate.save">>()(
    z.object({
      id: idSchema.optional(),
      name: z.string().min(1).max(80),
      description: z.string().max(500).nullish(),
      avatar: agentRoleAvatarSchema.nullish(),
      members: z
        .array(
          z.object({ agentRoleId: idSchema, prompt: z.string().max(8000) }),
        )
        .min(TEAM_MIN_MEMBERS)
        .max(TEAM_MAX_MEMBERS),
    }),
  ),
  "teamTemplate.delete": exact<Payload<"teamTemplate.delete">>()(
    z.object({ id: idSchema }),
  ),
  "scriptRun.start": exact<Payload<"scriptRun.start">>()(
    z.object({ runId: idSchema, maxAgents: maxAgentsSchema.optional() }),
  ),
  "scriptRun.cancel": exact<Payload<"scriptRun.cancel">>()(runIdPayload),
  "scriptRun.get": exact<Payload<"scriptRun.get">>()(runIdPayload),
  "scriptRun.list": exact<Payload<"scriptRun.list">>()(
    z.object({
      workspaceId: idSchema.optional(),
      requesterSessionId: idSchema.optional(),
    }),
  ),
  "scriptRun.settings.save": exact<Payload<"scriptRun.settings.save">>()(
    z.object({
      defaultMaxAgents: maxAgentsSchema,
      schemaMaxAttempts: z
        .number()
        .int()
        .min(1)
        .max(SCRIPT_RUN_MAX_SCHEMA_ATTEMPTS),
      maxDurationMinutes: z.number().int().min(1).nullable(),
    }),
  ),
  "agent.sessionModes.read": exact<Payload<"agent.sessionModes.read">>()(
    z.object({ agentId: agentIdSchema }),
  ),
  "agent.login": exact<Payload<"agent.login">>()(
    z.object({
      agentId: agentIdSchema,
      methodId: boundedTextSchema(200).min(1).optional(),
    }),
  ),
  "agent.login.cancel": exact<Payload<"agent.login.cancel">>()(
    z.object({ agentId: agentIdSchema }),
  ),
  "agent.logout": exact<Payload<"agent.logout">>()(
    z.object({ agentId: acpRegistryAgentIdSchema }),
  ),
  "agent.auth.read": exact<Payload<"agent.auth.read">>()(
    z.object({ agentId: acpRegistryAgentIdSchema }),
  ),
  "agent.rateLimits.read": exact<Payload<"agent.rateLimits.read">>()(
    z.object({ agentIds: z.array(agentIdSchema).max(64) }),
  ),
  "agentRole.get": exact<Payload<"agentRole.get">>()(
    z.object({ id: idSchema }),
  ),
  "agentRole.save": loose<Payload<"agentRole.save">>()(
    z.looseObject({
      id: idSchema.optional(),
      name: boundedTextSchema(200).min(1),
      agentId: agentIdSchema,
      avatar: agentRoleAvatarSchema.nullish(),
    }),
  ),
  "agentRole.delete": exact<Payload<"agentRole.delete">>()(
    z.object({ id: idSchema }),
  ),
} satisfies PayloadSchemas;
