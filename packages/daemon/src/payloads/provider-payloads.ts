import { providerApis, reasoningEfforts } from "@cocurdex/shared";
import { z } from "zod";
import {
  acpRegistryAgentIdSchema,
  agentIdSchema,
  boundedTextSchema,
  exact,
  idSchema,
  noNullByte,
  type Payload,
  type PayloadSchemas,
  providerIdSchema,
} from "./primitives";

const providerJsonFieldSchema = z.string().max(131_072).nullish();

const modelSelectionSchema = boundedTextSchema(256);

const reasoningEffortSchema = z.enum(reasoningEfforts);

const timestampTextSchema = z.string().max(64);

const titleModelSelectionSchema = z.object({
  providerId: providerIdSchema,
  modelId: providerIdSchema,
});

const commitMessageModelSelectionSchema = z.object({
  agentId: agentIdSchema,
  providerId: providerIdSchema,
  modelId: modelSelectionSchema,
  reasoningEffort: reasoningEffortSchema.nullish(),
  thinkingLevel: z.enum(["default", "off", ...reasoningEfforts]).nullish(),
  serviceTier: z.string().max(256).nullish(),
  fastMode: z.boolean().nullish(),
  openCodeAgent: z.string().max(256).nullish(),
  openCodeVariant: z.string().max(256).nullish(),
});

const providerConfigSchema = z.object({
  id: providerIdSchema,
  name: z.string().min(1).max(256),
  baseUrl: boundedTextSchema(4096).min(1),
  enabled: z.boolean(),
  apiKeySecretId: z.string().max(256).nullable(),
  headersJson: providerJsonFieldSchema,
  compatJson: providerJsonFieldSchema,
  createdAt: timestampTextSchema,
  updatedAt: timestampTextSchema,
});

const providerModelSchema = z.object({
  providerId: providerIdSchema,
  modelId: providerIdSchema,
  name: z.string().min(1).max(256),
  api: z.enum(providerApis),
  enabled: z.boolean(),
  source: z.enum(["api", "manual"]),
  baseUrl: boundedTextSchema(4096).nullish(),
  contextLimit: z.number().int().positive().nullish(),
  outputLimit: z.number().int().positive().nullish(),
  capabilities: z
    .array(z.enum(["agent", "chat", "vision", "reasoning"]))
    .optional(),
  reasoning: z.boolean().optional(),
  thinkingLevelMapJson: providerJsonFieldSchema,
  costJson: providerJsonFieldSchema,
  compatJson: providerJsonFieldSchema,
  defaultReasoningEffort: reasoningEffortSchema.nullish(),
  supportedReasoningEfforts: z
    .array(
      z.object({
        reasoningEffort: reasoningEffortSchema,
        description: z.string().max(1024),
        label: z.string().max(256).nullish(),
      }),
    )
    .optional(),
  serviceTiers: z
    .array(
      z.object({
        id: z.string().min(1).max(256),
        name: z.string().max(256),
        description: z.string().max(1024),
      }),
    )
    .optional(),
  supportsFastMode: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  createdAt: timestampTextSchema,
  updatedAt: timestampTextSchema,
});

const networkProxySettingsSchema = z.object({
  mode: z.enum(["off", "system", "manual"]),
  httpProxy: boundedTextSchema(4096),
  httpsProxy: boundedTextSchema(4096),
  allProxy: boundedTextSchema(4096),
  noProxy: boundedTextSchema(8192),
});

const registryIdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9._-]{0,63}$/i, "invalid registry id");

const providerIdPayload = z.object({ providerId: providerIdSchema });

const loginIdPayload = z.object({
  loginId: z.string().min(1).max(512).refine(noNullByte, "null byte"),
});

export const providerPayloadSchemas = {
  "acpRegistry.catalog": exact<Payload<"acpRegistry.catalog">>()(
    z.object({ forceRefresh: z.boolean().optional() }),
  ),
  "acpRegistry.install": exact<Payload<"acpRegistry.install">>()(
    z.object({ registryId: registryIdSchema }),
  ),
  "acpRegistry.installCommand": exact<Payload<"acpRegistry.installCommand">>()(
    z.object({
      registryId: registryIdSchema,
      command: z.string().trim().min(1).max(4096),
      args: z.array(z.string().max(4096)).max(64),
    }),
  ),
  "acpRegistry.uninstall": exact<Payload<"acpRegistry.uninstall">>()(
    z.object({ agentId: acpRegistryAgentIdSchema }),
  ),
  "provider.apiKey.set": exact<Payload<"provider.apiKey.set">>()(
    z.object({
      providerId: providerIdSchema,
      apiKey: boundedTextSchema(16_384).nullable(),
    }),
  ),
  "provider.config.get":
    exact<Payload<"provider.config.get">>()(providerIdPayload),
  "provider.config.save": exact<Payload<"provider.config.save">>()(
    z.object({ config: providerConfigSchema }),
  ),
  "provider.config.delete":
    exact<Payload<"provider.config.delete">>()(providerIdPayload),
  "provider.model.save": exact<Payload<"provider.model.save">>()(
    z.object({ model: providerModelSchema }),
  ),
  "provider.model.delete": exact<Payload<"provider.model.delete">>()(
    z.object({ providerId: providerIdSchema, modelId: providerIdSchema }),
  ),
  "provider.fetchModels":
    exact<Payload<"provider.fetchModels">>()(providerIdPayload),
  "provider.listModels": exact<Payload<"provider.listModels">>()(
    z.object({ providerId: providerIdSchema.optional() }),
  ),
  "provider.listAllModels": exact<Payload<"provider.listAllModels">>()(
    z.object({
      providerIds: z.array(providerIdSchema).max(256).optional(),
      forceRefresh: z.boolean().optional(),
    }),
  ),
  "provider.listCompatibleForAgent": exact<
    Payload<"provider.listCompatibleForAgent">
  >()(
    z.object({ agentId: agentIdSchema, forceRefresh: z.boolean().optional() }),
  ),
  "provider.modelAxes.probe": exact<Payload<"provider.modelAxes.probe">>()(
    z.object({ agentId: agentIdSchema, modelId: modelSelectionSchema }),
  ),
  "provider.default.get": exact<Payload<"provider.default.get">>()(
    z.object({ agentId: agentIdSchema }),
  ),
  "provider.default.set": exact<Payload<"provider.default.set">>()(
    z.object({
      agentId: agentIdSchema,
      providerId: providerIdSchema,
      modelId: modelSelectionSchema,
    }),
  ),
  "provider.titleModel.set": exact<Payload<"provider.titleModel.set">>()(
    z.object({ selection: titleModelSelectionSchema.nullable() }),
  ),
  "provider.titleModel.probe": exact<Payload<"provider.titleModel.probe">>()(
    z.object({ selection: titleModelSelectionSchema }),
  ),
  "provider.auth.read":
    exact<Payload<"provider.auth.read">>()(providerIdPayload),
  "provider.auth.logout":
    exact<Payload<"provider.auth.logout">>()(providerIdPayload),
  "provider.auth.login.start": exact<Payload<"provider.auth.login.start">>()(
    z.object({
      providerId: providerIdSchema,
      method: z.enum(["oauth", "api_key"]),
    }),
  ),
  "provider.auth.login.next":
    exact<Payload<"provider.auth.login.next">>()(loginIdPayload),
  "provider.auth.login.respond": exact<
    Payload<"provider.auth.login.respond">
  >()(
    z.object({
      loginId: idSchema,
      promptId: idSchema,
      value: z.string().max(16_384),
    }),
  ),
  "provider.auth.login.cancel":
    exact<Payload<"provider.auth.login.cancel">>()(loginIdPayload),
  "provider.importJson": exact<Payload<"provider.importJson">>()(
    z.object({ json: boundedTextSchema(4_194_304) }),
  ),
  "codex.login.wait": exact<Payload<"codex.login.wait">>()(loginIdPayload),
  "codex.login.cancel": exact<Payload<"codex.login.cancel">>()(loginIdPayload),
  "agent.runLimits.set": exact<Payload<"agent.runLimits.set">>()(
    z.object({
      limits: z.object({
        maxConcurrentRuns: z.number().int(),
        maxConcurrentRunsPerAgent: z.number().int(),
        delegatedRunTimeoutMinutes: z.number().int().nullable(),
      }),
    }),
  ),
  "git.commitMessageModel.set": exact<Payload<"git.commitMessageModel.set">>()(
    z.object({ selection: commitMessageModelSelectionSchema.nullable() }),
  ),
  "network.proxy.test": exact<Payload<"network.proxy.test">>()(
    z.object({ settings: networkProxySettingsSchema.optional() }),
  ),
  "network.proxy.set": exact<Payload<"network.proxy.set">>()(
    z.object({ settings: networkProxySettingsSchema }),
  ),
} satisfies PayloadSchemas;
