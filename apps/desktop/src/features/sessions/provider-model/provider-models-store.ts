import type {
  ProviderConfigRecord,
  ProviderModelRecord,
} from "@cocurdex/shared";
import { atom } from "jotai";
import { desktopApi } from "@/lib";

export const providerModelsAtom = atom<ProviderModelRecord[]>([]);

export const providerConfigsAtom = atom<ProviderConfigRecord[]>([]);

export const providerModelsLoadedAtom = atom(false);

export const bootstrapProviderModelsAtom = atom(null, async (_, set) => {
  try {
    const [models, configs] = await Promise.all([
      desktopApi.listAllProviderModels(),
      desktopApi.listProviderConfigs(),
    ]);
    set(providerModelsAtom, models);
    set(providerConfigsAtom, configs);
  } finally {
    set(providerModelsLoadedAtom, true);
  }
});

export function findProviderModel(
  models: ProviderModelRecord[],
  providerId: string | undefined | null,
  modelId: string | undefined | null,
) {
  if (!providerId || !modelId) {
    return null;
  }
  return (
    models.find((m) => m.providerId === providerId && m.modelId === modelId) ??
    null
  );
}
