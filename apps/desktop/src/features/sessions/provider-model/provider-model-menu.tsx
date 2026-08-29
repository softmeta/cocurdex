import type { CompatibleProviderModel } from "@cocurdex/shared";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  type AppDropdownTriggerAppearance,
  AppDropdownTriggerButton,
  AppSearchableSelect,
  type AppSearchableSelectOption,
} from "@/components";
import { Button, Spinner } from "@/components/ui";
// Sub-entry, not the settings barrel: that barrel reaches SettingsScreen ->
// @/app/layout, closing an initialization cycle back onto this module.
import { openSettings } from "@/features/settings/settings-navigation";
import { cn } from "@/lib";
import { ProviderModelCompoundMenu } from "./provider-model-compound-menu";

function getProviderModelValue({ model, provider }: CompatibleProviderModel) {
  return `${provider.id}::${model.modelId}`;
}

function getProviderModelLabel({ model, provider }: CompatibleProviderModel) {
  return `${provider.name} / ${model.name}`;
}

function splitProviderModelName(name: string) {
  const separator = " / ";
  const separatorIndex = name.indexOf(separator);

  if (separatorIndex === -1) {
    return null;
  }

  const groupLabel = name.slice(0, separatorIndex).trim();
  const itemLabel = name.slice(separatorIndex + separator.length).trim();

  if (!groupLabel || !itemLabel) {
    return null;
  }

  return { groupLabel, itemLabel };
}

function getProviderModelItemLabel({ model }: CompatibleProviderModel) {
  return splitProviderModelName(model.name)?.itemLabel ?? model.name;
}

function getProviderModelGroupLabel(item: CompatibleProviderModel) {
  return (
    splitProviderModelName(item.model.name)?.groupLabel ?? item.provider.name
  );
}

interface ProviderModelMenuProps {
  align?: "start" | "center" | "end";
  appearance?: AppDropdownTriggerAppearance;
  compatibleProviders: CompatibleProviderModel[];
  disabled?: boolean;
  /** Optional empty selection for settings surfaces where the model is opt-in. */
  emptyOptionLabel?: string;
  /** Extra rows rendered inside the menu (e.g. the permission mode submenu). */
  footer?: ReactNode;
  isLoading?: boolean;
  fastModeOptions?: ProviderModelMenuOption[];
  fastModeValue?: string;
  openCodeAgentOptions?: ProviderModelMenuOption[];
  openCodeAgentDefaultValue?: string;
  openCodeAgentValue?: string;
  openCodeVariantOptions?: ProviderModelMenuOption[];
  openCodeVariantValue?: string;
  reasoningEffortOptions?: ProviderModelMenuOption[];
  /** Effort the model runs at when the session has no override. */
  reasoningEffortDefaultValue?: string;
  reasoningEffortValue?: string;
  serviceTierOptions?: ProviderModelMenuOption[];
  serviceTierValue?: string;
  showProviderGroupLabels?: boolean;
  thinkingLevelValue?: string;
  triggerClassName?: string;
  triggerValues?: readonly string[];
  value: string;
  onChange(value: string): void;
  onFastModeChange?(value: string): void;
  onOpenCodeAgentChange?(value: string): void;
  onOpenCodeVariantChange?(value: string): void;
  onReasoningEffortChange?(value: string): void;
  onResetRuntimeOptions?(): void;
  onServiceTierChange?(value: string): void;
  onThinkingLevelReset?(): void;
}

interface ProviderModelMenuOption {
  description?: string;
  isDefault?: boolean;
  label: string;
  value: string;
}

export function ProviderModelMenu({
  align = "start",
  appearance = "outline",
  compatibleProviders,
  disabled = false,
  emptyOptionLabel,
  footer,
  isLoading = false,
  fastModeOptions = [],
  fastModeValue = "off",
  openCodeAgentOptions = [],
  openCodeAgentDefaultValue = "",
  openCodeAgentValue = "",
  openCodeVariantOptions = [],
  openCodeVariantValue = "",
  reasoningEffortOptions = [],
  reasoningEffortDefaultValue = "",
  reasoningEffortValue = "",
  serviceTierOptions = [],
  serviceTierValue = "",
  showProviderGroupLabels = true,
  thinkingLevelValue = "",
  triggerClassName,
  triggerValues,
  value,
  onChange,
  onFastModeChange,
  onOpenCodeAgentChange,
  onOpenCodeVariantChange,
  onReasoningEffortChange,
  onResetRuntimeOptions,
  onServiceTierChange,
  onThinkingLevelReset,
}: ProviderModelMenuProps) {
  const { t } = useTranslation("sessions");
  const hasConfiguredModels = compatibleProviders.length > 0;
  const selectedProviderModel = compatibleProviders.find(
    (providerModel) => getProviderModelValue(providerModel) === value,
  );
  let fallbackLabel: string = t("modelMenu.selectModel");
  if (!hasConfiguredModels) {
    fallbackLabel = t("modelMenu.openProviderSettings");
  }
  let triggerLabel = emptyOptionLabel ?? fallbackLabel;
  if (selectedProviderModel) {
    triggerLabel = getProviderModelItemLabel(selectedProviderModel);
  }

  const modelOptions = useMemo((): AppSearchableSelectOption[] => {
    const options: AppSearchableSelectOption[] = emptyOptionLabel
      ? [
          {
            value: "",
            label: emptyOptionLabel,
            group: "",
            groupLabel: "",
          },
        ]
      : [];
    for (const providerModel of compatibleProviders) {
      const groupLabel = getProviderModelGroupLabel(providerModel);
      options.push({
        value: getProviderModelValue(providerModel),
        label: getProviderModelItemLabel(providerModel),
        keywords: `${getProviderModelLabel(providerModel)} ${providerModel.model.modelId}`,
        group: `${providerModel.provider.id}:${groupLabel}`,
        groupLabel: showProviderGroupLabels ? groupLabel : "",
      });
    }
    return options;
  }, [compatibleProviders, emptyOptionLabel, showProviderGroupLabels]);

  const hasReasoningEffortOptions = reasoningEffortOptions.length > 1;
  const hasServiceTierOptions = serviceTierOptions.length > 1;
  const hasFastModeOptions = fastModeOptions.length > 1;
  const hasOpenCodeAgentOptions = openCodeAgentOptions.length > 1;
  const hasOpenCodeVariantOptions = openCodeVariantOptions.length > 1;
  const hasRuntimeOptions =
    hasReasoningEffortOptions ||
    hasServiceTierOptions ||
    hasFastModeOptions ||
    hasOpenCodeAgentOptions ||
    hasOpenCodeVariantOptions;

  if (isLoading) {
    return (
      <AppDropdownTriggerButton
        aria-label={t("modelMenu.triggerLabel")}
        appearance={appearance}
        className={cn(
          "max-w-[280px]",
          triggerClassName,
          "w-7 justify-center px-0",
        )}
        disabled
        showChevron={false}
      >
        <Spinner size="xs" />
      </AppDropdownTriggerButton>
    );
  }

  const opensSettingsDirectly = !hasConfiguredModels;

  if (opensSettingsDirectly) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-label={t("modelMenu.openProviderSettings")}
        className={cn("h-7 max-w-[280px] gap-1.5 px-2", triggerClassName)}
        disabled={disabled}
        onClick={() => openSettings("providers")}
      >
        {t("modelMenu.openProviderSettings")}
      </Button>
    );
  }

  // Agents exposing runtime axes (Codex reasoning effort / service tier) get
  // the compound submenu picker; everyone else keeps the searchable list.
  if (hasRuntimeOptions || footer) {
    return (
      <ProviderModelCompoundMenu
        align={align}
        appearance={appearance}
        disabled={disabled}
        footer={footer}
        modelOptions={modelOptions}
        modelValue={value}
        fastModeOptions={fastModeOptions}
        fastModeValue={fastModeValue}
        openCodeAgentOptions={openCodeAgentOptions}
        openCodeAgentDefaultValue={openCodeAgentDefaultValue}
        openCodeAgentValue={openCodeAgentValue}
        openCodeVariantOptions={openCodeVariantOptions}
        openCodeVariantValue={openCodeVariantValue}
        reasoningEffortOptions={reasoningEffortOptions}
        reasoningEffortDefaultValue={reasoningEffortDefaultValue}
        reasoningEffortValue={reasoningEffortValue}
        serviceTierOptions={serviceTierOptions}
        serviceTierValue={serviceTierValue}
        triggerClassName={triggerClassName}
        triggerLabel={triggerLabel}
        triggerValues={triggerValues}
        onModelChange={onChange}
        onFastModeChange={onFastModeChange}
        onOpenCodeAgentChange={onOpenCodeAgentChange}
        onOpenCodeVariantChange={onOpenCodeVariantChange}
        onReasoningEffortChange={onReasoningEffortChange}
        onResetRuntimeOptions={onResetRuntimeOptions}
        onThinkingLevelReset={onThinkingLevelReset}
        thinkingLevelValue={thinkingLevelValue}
        onServiceTierChange={onServiceTierChange}
      />
    );
  }

  return (
    <AppSearchableSelect
      align={align}
      appearance={appearance}
      disabled={disabled}
      emptyText={t("modelMenu.empty")}
      options={modelOptions}
      searchPlaceholder={t("modelMenu.searchPlaceholder")}
      triggerAriaLabel={t("modelMenu.triggerLabel")}
      triggerClassName={cn("max-w-[280px]", triggerClassName)}
      triggerLabel={triggerLabel}
      value={value}
      onValueChange={onChange}
    />
  );
}
