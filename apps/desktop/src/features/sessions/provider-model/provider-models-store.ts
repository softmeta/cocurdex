import type {
  ProviderConfigRecord,
  ProviderModelRecord,
} from "@cocurdex/shared";
import { atom } from "jotai";
import { desktopApi } from "@/lib";

// All provider+model rows known to the desktop app. Loaded once during app
// bootstrap; consumers look up `contextLimit` and other static metadata by
// (providerId, modelId). Provider settings UI mutates the same records via
// IPC, so we expose a refresh action for after edits.
export const providerModelsAtom = atom<ProviderModelRecord[]>([]);

// Provider configs (id → name, api, …) loaded alongside the models so chat's
// model picker can pair each model with its provider for grouped display.
export const providerConfigsAtom = atom<ProviderConfigRecord[]>([]);

/**
 * Distinguishes "nothing configured" from "not loaded yet". Surfaces that key
 * off an empty provider list (the welcome screen) must not act on the empty
 * state bootstrap starts from. Set even on failure so a broken IPC leaves a
 * usable app rather than a stuck splash.
 */
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
