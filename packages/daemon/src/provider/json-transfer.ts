import {
  exportProviderJson,
  type PiModelsJson,
  type ProviderImportResult,
  parseProviderJson,
} from "@cocurdex/shared";
import type { DaemonState } from "../state";

type ProviderJsonState = Pick<
  DaemonState,
  | "getProviderConfig"
  | "listProviderConfigs"
  | "listProviderModels"
  | "saveProviderConfig"
  | "saveProviderModel"
>;

type SetApiKey = (providerId: string, apiKey: string) => Promise<void>;

export async function importProviderJson(
  state: ProviderJsonState,
  setApiKey: SetApiKey,
  json: string,
): Promise<ProviderImportResult> {
  const now = new Date().toISOString();
  const parsed = parseProviderJson(json, now);
  if (!parsed.ok) throw new Error(parsed.error);

  for (const entry of parsed.providers) {
    const existing = await state.getProviderConfig(entry.provider.id);
    await state.saveProviderConfig({
      ...entry.provider,
      apiKeySecretId: existing?.apiKeySecretId ?? null,
      createdAt: existing?.createdAt ?? now,
      headersJson: entry.provider.headersJson ?? existing?.headersJson ?? null,
      compatJson: entry.provider.compatJson ?? existing?.compatJson ?? null,
    });
    if (entry.apiKey) await setApiKey(entry.provider.id, entry.apiKey);

    const existingModels = await state.listProviderModels(entry.provider.id);
    for (const model of entry.models) {
      const previous = existingModels.find(
        (item) => item.modelId === model.modelId,
      );
      await state.saveProviderModel({
        ...model,
        createdAt: previous?.createdAt ?? now,
      });
    }
  }

  return {
    providerIds: parsed.providers.map((entry) => entry.provider.id),
    modelCount: parsed.providers.reduce(
      (total, entry) => total + entry.models.length,
      0,
    ),
    warnings: parsed.warnings,
  };
}

export async function exportConfiguredProviderJson(
  state: ProviderJsonState,
): Promise<PiModelsJson> {
  return exportProviderJson(
    await state.listProviderConfigs(),
    await state.listProviderModels(),
  );
}
