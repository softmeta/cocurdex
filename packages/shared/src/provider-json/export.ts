import type { ProviderConfigRecord, ProviderModelRecord } from "../contracts";

type JsonObject = Record<string, unknown>;

export interface PiModelsJson {
  providers: Record<string, JsonObject>;
}

function parseJson(value: string | null | undefined): unknown {
  return value ? JSON.parse(value) : undefined;
}

function withoutUndefined(entries: Array<[string, unknown]>): JsonObject {
  return Object.fromEntries(entries.filter(([, value]) => value !== undefined));
}

function exportModel(
  model: ProviderModelRecord,
  provider: ProviderConfigRecord,
): JsonObject {
  const inheritsCompat = model.compatJson === provider.compatJson;
  return withoutUndefined([
    ["id", model.modelId],
    ["name", model.name === model.modelId ? undefined : model.name],
    ["api", model.api],
    ["baseUrl", model.baseUrl ?? undefined],
    ["reasoning", model.reasoning ? true : undefined],
    [
      "input",
      model.capabilities?.includes("vision") ? ["text", "image"] : undefined,
    ],
    ["contextWindow", model.contextLimit ?? undefined],
    ["maxTokens", model.outputLimit ?? undefined],
    ["cost", parseJson(model.costJson)],
    ["compat", inheritsCompat ? undefined : parseJson(model.compatJson)],
    ["thinkingLevelMap", parseJson(model.thinkingLevelMapJson)],
  ]);
}

export function exportProviderJson(
  providers: readonly ProviderConfigRecord[],
  models: readonly ProviderModelRecord[],
): PiModelsJson {
  const entries = providers.map((provider): [string, JsonObject] => [
    provider.id,
    withoutUndefined([
      ["name", provider.name === provider.id ? undefined : provider.name],
      ["baseUrl", provider.baseUrl],
      ["headers", parseJson(provider.headersJson)],
      ["compat", parseJson(provider.compatJson)],
      [
        "models",
        models
          .filter((model) => model.providerId === provider.id)
          .map((model) => exportModel(model, provider)),
      ],
    ]),
  ]);
  return { providers: Object.fromEntries(entries) };
}
