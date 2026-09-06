import { useAtomValue } from "jotai";
import { ProviderModelMenu } from "@/features/sessions";
import { chatProviderModelsAtom } from "./chat-models";

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
  const compatibleProviders = useAtomValue(chatProviderModelsAtom);

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
