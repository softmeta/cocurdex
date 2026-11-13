import path from "node:path";
import type { RuntimeProviderConfig } from "@cocurdex/agent-core";
import { DEFAULT_MODEL_CONTEXT_WINDOW, hostForLog } from "@cocurdex/shared";
import type { Api, Model } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { logAdapterDiagnostic } from "../diagnostics";
import {
  buildModelCost,
  buildModelInput,
  parseHeaders,
  parseJsonObject,
} from "./pi-model-utils";
import { getPiAgentDir } from "./pi-paths";
import {
  getPiTemplateBaseUrl,
  isPiBuiltInProviderId,
  piRequestApiKey,
} from "./pi-provider-catalog";

export type PiCatalogRefresh = "none" | "cache" | "network";

export interface CreatePiModelRuntimeOptions {
  refresh?: PiCatalogRefresh;
  providers?: readonly string[];
  signal?: AbortSignal;
  ModelRuntime?: Pick<typeof ModelRuntime, "create">;
}

/**
 * One pi model runtime over Cocurdex's own pi agent directory: `auth.json` holds pi logins and
 * `models-store.json` caches the remote catalogs pi refreshes. `models.json` there stays unused.
 */
export async function createPiModelRuntime(
  userDataPath: string | undefined,
  options: CreatePiModelRuntimeOptions = {},
): Promise<ModelRuntime> {
  const agentDir = getPiAgentDir(userDataPath);
  const Runtime = options.ModelRuntime ?? ModelRuntime;
  const runtime = await Runtime.create({
    authPath: path.join(agentDir, "auth.json"),
    modelsPath: path.join(agentDir, "models.json"),
    refreshOnCreate: false,
  });
  const refresh = options.refresh ?? "none";
  if (refresh !== "none") {
    await runtime.refresh({
      allowNetwork: refresh === "network",
      force: refresh === "network",
      providers: options.providers,
      signal: options.signal,
    });
  }
  return runtime;
}

function differentUrl(value: string | null | undefined, base?: string) {
  const trimmed = value?.trim();
  return trimmed && trimmed !== base ? trimmed : undefined;
}

function builtInModelTemplate(
  runtime: ModelRuntime,
  config: RuntimeProviderConfig,
): Model<Api> | undefined {
  const exact = runtime.getModel(config.providerId, config.modelId);
  if (exact) return exact;
  const sibling = runtime
    .getModels(config.providerId)
    .find((model) => model.api === config.api);
  return sibling
    ? { ...sibling, id: config.modelId, name: config.modelName }
    : undefined;
}

function resolveBuiltInModel(
  runtime: ModelRuntime,
  config: RuntimeProviderConfig,
): Model<Api> | undefined {
  const base = builtInModelTemplate(runtime, config);
  if (!base) return undefined;
  const providerBaseUrl = differentUrl(
    config.baseUrl,
    getPiTemplateBaseUrl(config.providerId),
  );
  const modelBaseUrl = differentUrl(config.modelBaseUrl, base.baseUrl);
  const headers = parseHeaders(config.headersJson);
  return {
    ...base,
    name: config.modelName || base.name,
    api: config.api,
    baseUrl: modelBaseUrl ?? providerBaseUrl ?? base.baseUrl,
    reasoning: config.supportsReasoning ?? base.reasoning,
    thinkingLevelMap:
      parseJsonObject(config.modelThinkingLevelMapJson) ??
      base.thinkingLevelMap,
    input: config.modelCapabilities?.length
      ? buildModelInput(config.modelCapabilities)
      : base.input,
    cost: config.modelCostJson
      ? buildModelCost(config.modelCostJson)
      : base.cost,
    contextWindow: config.modelContextWindow || base.contextWindow,
    maxTokens: config.modelMaxTokens || base.maxTokens,
    headers: headers ? { ...base.headers, ...headers } : base.headers,
    compat:
      parseJsonObject(config.modelCompatJson) ??
      parseJsonObject(config.providerCompatJson) ??
      base.compat,
  } as Model<Api>;
}

function registerCustomProvider(
  runtime: ModelRuntime,
  config: RuntimeProviderConfig,
  apiKey: string | null,
) {
  const compat =
    parseJsonObject(config.modelCompatJson) ??
    parseJsonObject(config.providerCompatJson);
  const resolvedBaseUrl = config.modelBaseUrl || config.baseUrl || undefined;
  runtime.registerProvider(config.providerId, {
    name: config.providerName,
    baseUrl: config.baseUrl || undefined,
    apiKey: apiKey || undefined,
    api: config.api,
    headers: parseHeaders(config.headersJson),
    models: [
      {
        id: config.modelId,
        name: config.modelName || config.modelId,
        api: config.api,
        baseUrl: resolvedBaseUrl,
        reasoning: config.supportsReasoning ?? Boolean(config.reasoningEffort),
        thinkingLevelMap: parseJsonObject(config.modelThinkingLevelMapJson),
        input: buildModelInput(config.modelCapabilities),
        cost: buildModelCost(config.modelCostJson),
        contextWindow:
          config.modelContextWindow || DEFAULT_MODEL_CONTEXT_WINDOW,
        maxTokens: config.modelMaxTokens ?? 0,
        compat,
      },
    ],
  });
  return runtime.getModel(config.providerId, config.modelId);
}

/**
 * Resolves the model a Cocurdex provider config names. Built-in pi providers keep pi's own
 * auth, endpoint resolution, and request handling; only a Cocurdex-stored API key and the
 * user's model edits are layered on. Custom providers are registered from the config.
 */
export async function resolvePiRuntimeModel(
  runtime: ModelRuntime,
  config: RuntimeProviderConfig,
): Promise<Model<Api> | undefined> {
  const builtIn = isPiBuiltInProviderId(config.providerId);
  const apiKey = builtIn
    ? config.apiKey
    : piRequestApiKey(config.providerId, config.apiKey);
  if (apiKey) {
    await runtime.setRuntimeApiKey(config.providerId, apiKey);
  } else {
    await runtime.removeRuntimeApiKey(config.providerId);
  }
  const model = builtIn
    ? resolveBuiltInModel(runtime, config)
    : registerCustomProvider(runtime, config, apiKey);
  logAdapterDiagnostic("info", "pi: resolved provider model", {
    providerId: config.providerId,
    modelId: config.modelId,
    api: config.api,
    builtIn,
    endpointHost: hostForLog(model?.baseUrl),
  });
  return model;
}
