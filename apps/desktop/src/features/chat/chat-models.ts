import { isChatCapableModel, isChatSupportedApi } from "@cocurdex/shared";
import { atom } from "jotai";
import { providerConfigsAtom, providerModelsAtom } from "@/features/sessions";

export const chatProviderModelsAtom = atom((get) => {
  const providers = new Map(
    get(providerConfigsAtom).map((provider) => [provider.id, provider]),
  );
  return get(providerModelsAtom).flatMap((model) => {
    const provider = providers.get(model.providerId);
    if (
      !provider?.enabled ||
      !model.enabled ||
      !isChatSupportedApi(model.api) ||
      !isChatCapableModel(model.capabilities)
    )
      return [];
    return [{ provider, model }];
  });
});

export const chatModelsAtom = atom((get) =>
  get(chatProviderModelsAtom).map(({ model }) => model),
);
