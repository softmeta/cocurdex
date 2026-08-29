import {
  type CompatibleProviderModel,
  isChatCapableModel,
  isChatSupportedApi,
} from "@cocurdex/shared";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import {
  ProviderModelMenu,
  providerConfigsAtom,
  providerModelsAtom,
} from "@/features/sessions";

interface ModelPickerProps {
  providerId: string | null;
  modelId: string | null;
  onChange(providerId: string, modelId: string): void;
  disabled?: boolean;
}

// Chat composer's provider+model selector. Shares the agent-mode
// ProviderModelMenu so both modes look and search identically. Surfaces enabled
// models whose runtime has a chat adapter and that declare the chat capability
// (models without explicit capabilities are treated as chat-capable).
export function ModelPicker({
  providerId,
  modelId,
  onChange,
  disabled,
}: ModelPickerProps) {
  const models = useAtomValue(providerModelsAtom);
  const providers = useAtomValue(providerConfigsAtom);

  const compatibleProviders = useMemo<CompatibleProviderModel[]>(() => {
    const providerById = new Map(providers.map((p) => [p.id, p]));
    return models
      .filter(
        (m) =>
          m.enabled &&
          isChatSupportedApi(m.api) &&
          isChatCapableModel(m.capabilities),
      )
      .flatMap((model) => {
        const provider = providerById.get(model.providerId);
        return provider ? [{ model, provider }] : [];
      });
  }, [models, providers]);

  const value = providerId && modelId ? `${providerId}::${modelId}` : "";

  return (
    <ProviderModelMenu
      appearance="ghost"
      compatibleProviders={compatibleProviders}
      disabled={disabled}
      value={value}
      onChange={(next) => {
        const [nextProviderId, nextModelId] = next.split("::");
        if (nextProviderId && nextModelId) {
          onChange(nextProviderId, nextModelId);
        }
      }}
    />
  );
}
