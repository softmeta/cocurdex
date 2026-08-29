import { RotateCcw } from "lucide-react";
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

// Group the flat option list the model picker already builds into submenu
// sections so models from different providers stay visually separated.
function toModelSections(
  options: AppSearchableSelectOption[],
): AppDropdownRadioSection[] {
  // Options with no group label (single-provider lists, the empty option) all
  // share one unlabeled leading section instead of getting a header each.
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

  // A lone group header names what the whole submenu already is.
  if (grouped.length === 1) {
    return [{ label: "", options: grouped[0]?.[1] ?? [] }];
  }

  return grouped.map(([label, entries]) => ({ label, options: entries }));
}

/**
 * Compound picker: one trigger opening model and runtime-axis rows that each
 * drill into a submenu, plus a reset for the runtime axes.
 */
export function ProviderModelCompoundMenu({
  align = "start",
  appearance,
  disabled,
  footer,
  modelOptions,
  modelValue,
  fastModeOptions,
  fastModeValue,
  openCodeAgentOptions,
  openCodeAgentDefaultValue,
  openCodeAgentValue,
  openCodeVariantOptions,
  openCodeVariantValue,
  reasoningEffortOptions,
  reasoningEffortDefaultValue,
  reasoningEffortValue,
  serviceTierOptions,
  serviceTierValue,
  thinkingLevelValue,
  triggerClassName,
  triggerLabel,
  triggerValues,
  onModelChange,
  onFastModeChange,
  onOpenCodeAgentChange,
  onOpenCodeVariantChange,
  onReasoningEffortChange,
  onResetRuntimeOptions,
  onServiceTierChange,
  onThinkingLevelReset,
}: {
  align?: "start" | "center" | "end";
  appearance?: AppDropdownTriggerAppearance;
  disabled?: boolean;
  /** Extra runtime rows shown under the axes (e.g. permission mode). */
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
  /** Thinking level owned by the footer row; reset clears it with the axes. */
  thinkingLevelValue?: string;
  triggerClassName?: string;
  triggerLabel: string;
  /** Additional selected runtime values owned by the menu footer. */
  triggerValues?: readonly string[];
  onModelChange(value: string): void;
  onFastModeChange?(value: string): void;
  onOpenCodeAgentChange?(value: string): void;
  onOpenCodeVariantChange?(value: string): void;
  onReasoningEffortChange?(value: string): void;
  onResetRuntimeOptions?(): void;
  onServiceTierChange?(value: string): void;
  onThinkingLevelReset?(): void;
}) {
  const { t } = useTranslation("sessions");
  const hasReasoningEffort = reasoningEffortOptions.length > 1;
  // The effort axis has no "inherit" row: the model default is preselected, so
  // reset means "go back to that default" rather than "clear the value".
  const hasEffortOverride =
    Boolean(reasoningEffortValue) &&
    reasoningEffortValue !== reasoningEffortDefaultValue;
  const hasServiceTier = serviceTierOptions.length > 1;
  const hasFastMode = fastModeOptions.length > 1;
  const hasOpenCodeAgent = openCodeAgentOptions.length > 1;
  const hasOpenCodeVariant = openCodeVariantOptions.length > 1;
  const canReset = Boolean(
    hasEffortOverride ||
      serviceTierValue ||
      fastModeValue === "on" ||
      openCodeAgentValue !== openCodeAgentDefaultValue ||
      openCodeVariantValue ||
      thinkingLevelValue,
  );
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
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <AppDropdownTriggerLabel>{triggerLabel}</AppDropdownTriggerLabel>
            {activeTriggerValues.length > 0 ? (
              <span className="min-w-0 truncate font-normal text-muted-foreground @max-[26rem]/composer:hidden">
                {activeTriggerValues.join(" · ")}
              </span>
            ) : null}
          </span>
        </AppDropdownTriggerButton>
      </DropdownMenuTrigger>
      <AppDropdownContent align={align} className="min-w-56" side="bottom">
        <RuntimeAxisSubmenu
          label={t("modelMenu.triggerLabel")}
          sections={toModelSections(modelOptions)}
          value={modelValue}
          onValueChange={onModelChange}
        />
        {hasReasoningEffort ? (
          <RuntimeAxisSubmenu
            label={t("modelMenu.reasoningEffort")}
            options={reasoningEffortOptions}
            value={reasoningEffortValue}
            onValueChange={(value) => onReasoningEffortChange?.(value)}
          />
        ) : null}
        {hasFastMode ? (
          <RuntimeAxisSubmenu
            label={t("modelMenu.fastMode")}
            options={fastModeOptions}
            value={fastModeValue}
            onValueChange={(value) => onFastModeChange?.(value)}
          />
        ) : null}
        {hasOpenCodeAgent ? (
          <RuntimeAxisSubmenu
            label={t("modelMenu.openCodeAgent")}
            options={openCodeAgentOptions}
            value={openCodeAgentValue}
            onValueChange={(value) => onOpenCodeAgentChange?.(value)}
          />
        ) : null}
        {hasOpenCodeVariant ? (
          <RuntimeAxisSubmenu
            label={t("modelMenu.openCodeVariant")}
            options={openCodeVariantOptions}
            value={openCodeVariantValue}
            onValueChange={(value) => onOpenCodeVariantChange?.(value)}
          />
        ) : null}
        {hasServiceTier ? (
          <RuntimeAxisSubmenu
            label={t("modelMenu.speed")}
            options={serviceTierOptions}
            // The speed tiers carry usage-cost consequences, so their copy
            // stays on the row instead of being dropped like the other axes.
            showDescriptions
            value={serviceTierValue}
            onValueChange={(value) => onServiceTierChange?.(value)}
          />
        ) : null}
        {footer}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!canReset}
          onClick={() => {
            if (onResetRuntimeOptions) {
              onResetRuntimeOptions();
              return;
            }
            onReasoningEffortChange?.("");
            onServiceTierChange?.("");
            onFastModeChange?.("off");
            onOpenCodeAgentChange?.("");
            onOpenCodeVariantChange?.("");
            onThinkingLevelReset?.();
          }}
        >
          <span className="flex-1 truncate">{t("modelMenu.reset")}</span>
          <RotateCcw className="size-3.5 text-muted-foreground" />
        </DropdownMenuItem>
      </AppDropdownContent>
    </DropdownMenu>
  );
}
