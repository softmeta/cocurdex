import {
  type ProviderApi,
  type ProviderConfigRecord,
  type ProviderModelCapability,
  type ProviderModelRecord,
  type ProviderTemplateRecord,
  providerApis,
} from "@cocurdex/shared";
import type { Api, Model, Provider } from "@earendil-works/pi-ai";
import {
  builtinProviders,
  getBuiltinProviders,
} from "@earendil-works/pi-ai/providers/all";
import {
  listCocurdexBuiltinProviderIds,
  listCocurdexBuiltinProviderModels,
  listCocurdexBuiltinProviderTemplates,
} from "./cocurdex-builtin-providers";

// Models on any api Cocurdex doesn't drive yet are dropped from the catalog.
const supportedApis = new Set<ProviderApi>(providerApis);

const excludedProviderIds = new Set([
  "amazon-bedrock",
  "azure-openai-responses",
  "github-copilot",
  "google-vertex",
  "openai-codex",
]);

// Base URLs Pi leaves empty on these providers (auth-only or templated hosts).
// Without them the provider has no endpoint and drops from the template list.
const providerBaseUrls: Record<string, string> = {
  "cloudflare-ai-gateway":
    "https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/compat",
  "cloudflare-workers-ai":
    "https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1",
  opencode: "https://opencode.ai/zen/v1",
  "opencode-go": "https://opencode.ai/zen/go/v1",
};

function isProviderApi(api: Api): api is ProviderApi {
  return supportedApis.has(api as ProviderApi);
}

function getSupportedProviderModels(provider: Provider): Model<ProviderApi>[] {
  const models = provider
    .getModels()
    .filter((model): model is Model<ProviderApi> => isProviderApi(model.api));
  return models;
}

function getTemplateBaseUrl(provider: Provider) {
  return providerBaseUrls[provider.id] ?? provider.baseUrl ?? "";
}

function isTemplateProvider(provider: Provider) {
  return (
    !excludedProviderIds.has(provider.id) &&
    Boolean(provider.auth.apiKey) &&
    Boolean(getTemplateBaseUrl(provider))
  );
}

function modelCapabilities(
  model: Model<ProviderApi>,
): ProviderModelCapability[] {
  const capabilities: ProviderModelCapability[] = ["agent", "chat"];

  if (model.input.includes("image")) {
    capabilities.push("vision");
  }

  if (model.reasoning) {
    capabilities.push("reasoning");
  }

  return capabilities;
}

function serializeJson(value: unknown) {
  return value ? JSON.stringify(value) : null;
}

function mapPiModelToRecord(
  providerId: string,
  model: Model<ProviderApi>,
  now: string,
): ProviderModelRecord {
  return {
    providerId,
    modelId: model.id,
    name: model.name,
    api: model.api,
    enabled: true,
    source: "api",
    baseUrl: model.baseUrl ?? null,
    contextLimit: model.contextWindow || null,
    outputLimit: model.maxTokens || null,
    capabilities: modelCapabilities(model),
    reasoning: model.reasoning,
    thinkingLevelMapJson: serializeJson(model.thinkingLevelMap),
    costJson: serializeJson(model.cost),
    compatJson: serializeJson(model.compat),
    createdAt: now,
    updatedAt: now,
  };
}

export function listPiProviderTemplates(): ProviderTemplateRecord[] {
  const piTemplates = builtinProviders()
    .filter(isTemplateProvider)
    .map((provider) => ({
      id: provider.id,
      name: provider.name,
      baseUrl: getTemplateBaseUrl(provider),
    }));

  // Cocurdex extras first so product-specific presets stay visible near the
  // top of the template strip before the long pi-ai catalog.
  return [...listCocurdexBuiltinProviderTemplates(), ...piTemplates];
}

export function listPiBuiltInProviderIds(): string[] {
  return [...listCocurdexBuiltinProviderIds(), ...getBuiltinProviders()];
}

export async function listPiProviderModels(
  config: Pick<ProviderConfigRecord, "id">,
): Promise<ProviderModelRecord[] | null> {
  const cocurdexModels = listCocurdexBuiltinProviderModels(config.id);
  if (cocurdexModels) {
    return cocurdexModels;
  }

  const provider = builtinProviders().find((item) => item.id === config.id);
  if (!provider || !isTemplateProvider(provider)) {
    return null;
  }

  if (provider.refreshModels) {
    await provider.refreshModels();
  }

  const now = new Date().toISOString();

  // Gateways (opencode, fireworks, cloudflare) expose models across several
  // apis. Keep every supported-api model — each record carries its own api, so
  // downstream agent-compatibility filtering handles them per model.
  return getSupportedProviderModels(provider).map((model) =>
    mapPiModelToRecord(config.id, model, now),
  );
}
