import type { AgentThinkingLevel } from "@cocurdex/shared";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import {
  ProviderModelMenu,
  type ThinkingLevelOption,
  ThinkingLevelSubmenu,
} from "@/features/sessions";
import { chatProviderModelsAtom } from "./chat-models";

interface ModelPickerProps {
  providerId: string | null;
  modelId: string | null;
  onChange(providerId: string, modelId: string): void;
  thinkingLevel?: AgentThinkingLevel | null;
  thinkingLevelOptions?: ThinkingLevelOption[];
  onThinkingLevelChange?(level: AgentThinkingLevel): void;
  disabled?: boolean;
}

export function ModelPicker({
  providerId,
  modelId,
  onChange,
  thinkingLevel = null,
  thinkingLevelOptions = [],
  onThinkingLevelChange,
  disabled,
}: ModelPickerProps) {
  const { t } = useTranslation("sessions");
  const compatibleProviders = useAtomValue(chatProviderModelsAtom);
  const value = providerId && modelId ? `${providerId}::${modelId}` : "";
  const hasThinkingLevels = thinkingLevelOptions.length > 1;
  const triggerValues =
    hasThinkingLevels && thinkingLevel
      ? [t(`composer.thinkingLevels.${thinkingLevel}`)]
      : [];

  return (
    <ProviderModelMenu
      appearance="ghost"
      compatibleProviders={compatibleProviders}
      disabled={disabled}
      footer={
        hasThinkingLevels ? (
          <ThinkingLevelSubmenu
            level={thinkingLevel}
            options={thinkingLevelOptions}
            onChange={onThinkingLevelChange}
          />
        ) : undefined
      }
      triggerValues={triggerValues}
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
