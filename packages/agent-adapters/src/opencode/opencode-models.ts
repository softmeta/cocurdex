import type { CompatibleProviderModel, ProviderApi } from "@cocurdex/shared";
import type { Agent, ProviderListResponse } from "@opencode-ai/sdk/v2";
import {
  acquireOpenCodeRuntime,
  expectOpenCodeData,
  formatOpenCodeError,
  logOpenCode,
  releaseOpenCodeRuntime,
} from "./opencode-runtime";

type OpenCodeProvider = ProviderListResponse["all"][number];
type OpenCodeModel = OpenCodeProvider["models"][string];

export function assertOpenCodeModelAvailable(
  catalog: ProviderListResponse,
  selection: { modelId: string; providerId: string },
) {
  const provider = catalog.all.find(
    (candidate) => candidate.id === selection.providerId,
  );
  const isConnected = catalog.connected.includes(selection.providerId);
  const hasModel = provider
    ? Object.values(provider.models).some(
        (model) => model.id === selection.modelId,
      )
    : false;

  if (isConnected && hasModel) {
    return;
  }

  throw new Error(
    `OpenCode model ${selection.providerId}/${selection.modelId} is no longer available. Refresh the model list and select another model.`,
  );
}

function getModelCompatJson(
  model: OpenCodeModel,
  agents: string[],
): string | null {
  const variants = model.variants ? Object.keys(model.variants) : [];
  if (variants.length === 0 && agents.length === 0) return null;

  return JSON.stringify({
    opencode: {
      agents,
      variants,
    },
  });
}

function getProviderApi(
  provider: OpenCodeProvider,
  model: OpenCodeModel,
): ProviderApi {
  const npm = model.api.npm.toLowerCase();

  if (npm.includes("anthropic")) {
    return "anthropic-messages";
  }

  if (provider.id === "openai" && npm === "@ai-sdk/openai") {
    return "openai-responses";
  }

  return "openai-completions";
}

function getContextLimit(model: OpenCodeModel) {
  return Number.isFinite(model.limit.context) ? model.limit.context : null;
}

function getOutputLimit(model: OpenCodeModel) {
  return Number.isFinite(model.limit.output) ? model.limit.output : null;
}

export function getOpenCodePrimaryAgentNames(agents: ReadonlyArray<Agent>) {
  return agents
    .filter(
      (agent) =>
        !agent.hidden && (agent.mode === "primary" || agent.mode === "all"),
    )
    .map((agent) => agent.name);
}

export async function listOpenCodeProviderModels(): Promise<
  CompatibleProviderModel[]
> {
  let runtime = null;

  try {
    runtime = await acquireOpenCodeRuntime();
    const [result, agents] = await Promise.all([
      expectOpenCodeData(runtime.clientV2.provider.list(), "list providers"),
      expectOpenCodeData(runtime.clientV2.app.agents(), "list agents"),
    ]);
    const now = new Date().toISOString();
    const primaryAgents = getOpenCodePrimaryAgentNames(agents);

    const connectedProviderIds = new Set(result.connected);
    return result.all.flatMap((provider) => {
      if (!connectedProviderIds.has(provider.id)) {
        return [];
      }

      const defaultModelId = result.default[provider.id] ?? null;

      return Object.values(provider.models).map((model) => {
        const api = getProviderApi(provider, model);
        return {
          provider: {
            id: provider.id,
            name: provider.name,
            baseUrl: "",
            enabled: true,
            apiKeySecretId: null,
            createdAt: now,
            updatedAt: now,
          },
          model: {
            providerId: provider.id,
            modelId: model.id,
            name: model.name || model.id,
            api,
            enabled: true,
            source: "api" as const,
            contextLimit: getContextLimit(model),
            outputLimit: getOutputLimit(model),
            compatJson: getModelCompatJson(model, primaryAgents),
            isDefault: model.id === defaultModelId,
            createdAt: now,
            updatedAt: now,
          },
        };
      });
    });
  } catch (error) {
    logOpenCode("warn", "Failed to list OpenCode provider models", {
      error: formatOpenCodeError(error),
    });
    throw error;
  } finally {
    releaseOpenCodeRuntime(runtime);
  }
}
