import { Bookmark } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  AppDropdownContent,
  type AppDropdownRadioSection,
  type AppDropdownTriggerAppearance,
  AppDropdownTriggerButton,
  AppDropdownTriggerLabel,
  type AppSearchableSelectOption,
} from "@/components";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui";
import { cn } from "@/lib";
import {
  type RuntimeAxisOption,
  RuntimeAxisSubmenu,
} from "./runtime-axis-menu";

function toModelSections(
  options: AppSearchableSelectOption[],
): AppDropdownRadioSection[] {
  const sections = new Map<string, RuntimeAxisOption[]>();

  for (const option of options) {
    const label = option.groupLabel ?? "";
    const entries = sections.get(label) ?? [];
    sections.set(label, [
      ...entries,
      { value: option.value, label: option.label },
    ]);
  }

  const grouped = [...sections];

  if (grouped.length === 1) {
    return [{ label: "", options: grouped[0]?.[1] ?? [] }];
  }

  return grouped.map(([label, entries]) => ({ label, options: entries }));
}

export function ProviderModelCompoundMenu({
  align = "start",
  appearance,
  disabled,
  inspectOnly = false,
  header,
  footer,
  modelOptions,
  modelValue,
  fastModeOptions,
  fastModeValue,
  openCodeAgentOptions,
  openCodeAgentValue,
  openCodeVariantOptions,
  openCodeVariantValue,
  reasoningEffortOptions,
  reasoningEffortValue,
  serviceTierOptions,
  serviceTierValue,
  triggerClassName,
  triggerLabel,
  triggerLeading,
  triggerValues,
  onModelChange,
  onFastModeChange,
  onOpenCodeAgentChange,
  onOpenCodeVariantChange,
  onReasoningEffortChange,
  onSaveAsRole,
  onServiceTierChange,
}: {
  align?: "start" | "center" | "end";
  appearance?: AppDropdownTriggerAppearance;
  disabled?: boolean;
  inspectOnly?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
  modelOptions: AppSearchableSelectOption[];
  modelValue: string;
  fastModeOptions: RuntimeAxisOption[];
  fastModeValue: string;
  openCodeAgentOptions: RuntimeAxisOption[];
  openCodeAgentDefaultValue: string;
  openCodeAgentValue: string;
  openCodeVariantOptions: RuntimeAxisOption[];
  openCodeVariantValue: string;
  reasoningEffortOptions: RuntimeAxisOption[];
  reasoningEffortDefaultValue: string;
  reasoningEffortValue: string;
  serviceTierOptions: RuntimeAxisOption[];
  serviceTierValue: string;
  thinkingLevelValue?: string;
  triggerClassName?: string;
  triggerLabel: string;
  triggerLeading?: ReactNode;
  triggerValues?: readonly string[];
  onModelChange(value: string): void;
  onFastModeChange?(value: string): void;
  onOpenCodeAgentChange?(value: string): void;
  onOpenCodeVariantChange?(value: string): void;
  onReasoningEffortChange?(value: string): void;
  onSaveAsRole?(): void;
  onServiceTierChange?(value: string): void;
}) {
  const { t } = useTranslation("sessions");
  const hasReasoningEffort = reasoningEffortOptions.length > 1;
  const hasServiceTier = serviceTierOptions.length > 1;
  const hasFastMode = fastModeOptions.length > 1;
  const hasOpenCodeAgent = openCodeAgentOptions.length > 1;
  const hasOpenCodeVariant = openCodeVariantOptions.length > 1;
  const activeEffortLabel = reasoningEffortOptions.find(
    (option) => option.value === reasoningEffortValue && option.value,
  )?.label;
  const activeServiceTierLabel = serviceTierOptions.find(
    (option) => option.value === serviceTierValue && option.value,
  )?.label;
  const activeFastModeLabel =
    fastModeValue === "on"
      ? fastModeOptions.find((option) => option.value === fastModeValue)?.label
      : undefined;
  const activeOpenCodeAgentLabel = openCodeAgentOptions.find(
    (option) => option.value === openCodeAgentValue && option.value,
  )?.label;
  const activeOpenCodeVariantLabel = openCodeVariantOptions.find(
    (option) => option.value === openCodeVariantValue && option.value,
  )?.label;
  const activeTriggerValues = [
    activeOpenCodeAgentLabel,
    activeOpenCodeVariantLabel,
    activeEffortLabel,
    activeFastModeLabel,
    activeServiceTierLabel,
    ...(triggerValues ?? []),
  ].filter((value): value is string => Boolean(value));

  const triggerBody = (
    <span className="flex min-w-0 flex-1 items-center gap-1.5">
      {triggerLeading}
      <AppDropdownTriggerLabel>{triggerLabel}</AppDropdownTriggerLabel>
      {activeTriggerValues.length > 0 ? (
        <span className="min-w-0 truncate font-normal text-muted-foreground @max-[26rem]/composer:hidden">
          {activeTriggerValues.join(" · ")}
        </span>
      ) : null}
    </span>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <AppDropdownTriggerButton
          appearance={appearance}
          aria-label={t("modelMenu.triggerLabel")}
          className={cn(
            "max-w-[280px]",
            triggerClassName,
            "min-w-16 shrink overflow-hidden",
          )}
          disabled={disabled}
        >
          {triggerBody}
        </AppDropdownTriggerButton>
      </DropdownMenuTrigger>
      <AppDropdownContent align={align} className="min-w-56" side="bottom">
        {header}
        <RuntimeAxisSubmenu
          inspectOnly={inspectOnly}
          label={t("modelMenu.triggerLabel")}
          sections={toModelSections(modelOptions)}
          value={modelValue}
          onValueChange={onModelChange}
        />
        {hasReasoningEffort ? (
          <RuntimeAxisSubmenu
            inspectOnly={inspectOnly}
            label={t("modelMenu.reasoningEffort")}
            options={reasoningEffortOptions}
            value={reasoningEffortValue}
            onValueChange={(value) => onReasoningEffortChange?.(value)}
          />
        ) : null}
        {hasFastMode ? (
          <RuntimeAxisSubmenu
            inspectOnly={inspectOnly}
            label={t("modelMenu.fastMode")}
            options={fastModeOptions}
            value={fastModeValue}
            onValueChange={(value) => onFastModeChange?.(value)}
          />
        ) : null}
        {hasOpenCodeAgent ? (
          <RuntimeAxisSubmenu
            inspectOnly={inspectOnly}
            label={t("modelMenu.openCodeAgent")}
            options={openCodeAgentOptions}
            value={openCodeAgentValue}
            onValueChange={(value) => onOpenCodeAgentChange?.(value)}
          />
        ) : null}
        {hasOpenCodeVariant ? (
          <RuntimeAxisSubmenu
            inspectOnly={inspectOnly}
            label={t("modelMenu.openCodeVariant")}
            options={openCodeVariantOptions}
            value={openCodeVariantValue}
            onValueChange={(value) => onOpenCodeVariantChange?.(value)}
          />
        ) : null}
        {hasServiceTier ? (
          <RuntimeAxisSubmenu
            inspectOnly={inspectOnly}
            label={t("modelMenu.speed")}
            options={serviceTierOptions}
            showDescriptions
            value={serviceTierValue}
            onValueChange={(value) => onServiceTierChange?.(value)}
          />
        ) : null}
        {footer}
        {onSaveAsRole ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onSaveAsRole()}>
              <span className="flex-1 truncate">{t("agentRole.save")}</span>
              <Bookmark className="size-3.5 text-muted-foreground" />
            </DropdownMenuItem>
          </>
        ) : null}
      </AppDropdownContent>
    </DropdownMenu>
  );
}
