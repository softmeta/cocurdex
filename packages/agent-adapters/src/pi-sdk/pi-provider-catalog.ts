import {
  type ProviderApi,
  type ProviderAuthMethodRecord,
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

const providerBaseUrls: Record<string, string> = {
  "cloudflare-ai-gateway":
    "https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/compat",
  "cloudflare-workers-ai":
    "https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1",
  opencode: "https://opencode.ai/zen/v1",
  "opencode-go": "https://opencode.ai/zen/go/v1",
};

const supportedApis = new Set<string>(providerApis);

export function isPiProviderApi(api: Api): api is ProviderApi {
  return supportedApis.has(api);
}

function findBuiltinProvider(providerId: string) {
  return builtinProviders().find((provider) => provider.id === providerId);
}

export function getPiTemplateBaseUrl(providerId: string) {
  const provider = findBuiltinProvider(providerId);
  return provider ? getTemplateBaseUrl(provider) : undefined;
}

function getTemplateBaseUrl(provider: Provider) {
  return providerBaseUrls[provider.id] ?? provider.baseUrl ?? "";
}

function isTemplateProvider(provider: Provider) {
  return Boolean(provider.auth.oauth || provider.auth.apiKey);
}

function getProviderAuthMethods(provider: Provider) {
  const methods: ProviderAuthMethodRecord[] = [];
  if (provider.auth.oauth) {
    methods.push({
      type: "oauth",
      name: provider.auth.oauth.name,
      label: provider.auth.oauth.loginLabel ?? provider.auth.oauth.name,
      isSubscription: provider.auth.oauth.isSubscription ?? false,
    });
  }
  if (provider.auth.apiKey) {
    methods.push({
      type: "api_key",
      name: provider.auth.apiKey.name,
      label: provider.auth.apiKey.name,
      isSubscription: false,
    });
  }
  return methods;
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
  return builtinProviders()
    .filter(isTemplateProvider)
    .map((provider) => ({
      id: provider.id,
      name: provider.name,
      baseUrl: getTemplateBaseUrl(provider),
      authMethods: getProviderAuthMethods(provider),
    }));
}

export function listPiBuiltInProviderIds(): string[] {
  return getBuiltinProviders();
}

export function isPiBuiltInProviderId(providerId: string) {
  return listPiBuiltInProviderIds().includes(providerId);
}

const KEYLESS_PROVIDER_API_KEY = "cocurdex-keyless";

export function piRequestApiKey(providerId: string, apiKey: string | null) {
  if (apiKey) return apiKey;
  return isPiBuiltInProviderId(providerId) ? null : KEYLESS_PROVIDER_API_KEY;
}

export function mapPiModelsToRecords(
  providerId: string,
  models: readonly Model<Api>[],
): ProviderModelRecord[] {
  const now = new Date().toISOString();
  return models
    .filter((model): model is Model<ProviderApi> => isPiProviderApi(model.api))
    .map((model) => mapPiModelToRecord(providerId, model, now));
}
