import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  type AppDropdownTriggerAppearance,
  AppSearchableSelect,
  type AppSearchableSelectOption,
  AppSelect,
} from "@/components";
import { cn } from "@/lib";

export interface SettingsSelectOption {
  label: string;
  value: string;
}

export interface SettingsSelectGroup {
  label: string;
  options: SettingsSelectOption[];
}

interface SettingsSelectProps {
  ariaLabel: string;
  appearance?: AppDropdownTriggerAppearance;
  className?: string;
  compact?: boolean;
  disabled?: boolean;
  groups?: SettingsSelectGroup[];
  options?: SettingsSelectOption[];
  placeholder?: string;
  value: string;
  onChange(value: string): void;
}

// Setting-row triggers sit on the trailing edge of the row. They are
// content-sized (label + chevron, no fixed w-56 gap) and ghost by default —
// no form-field chrome. Searchable pickers use SettingsSearchableSelect.
export const settingsSelectTriggerClassName =
  "h-8 w-auto max-w-56 gap-1 px-2 font-normal";

export function SettingsSelect({
  ariaLabel,
  appearance = "ghost",
  className,
  compact = false,
  disabled = false,
  groups,
  options,
  placeholder,
  value,
  onChange,
}: SettingsSelectProps) {
  const { t } = useTranslation("settings");
  // Merge, don't pick one: callers may pass both a flat options list and
  // grouped options (e.g. a "none" option above provider-grouped models). The
  // selected label must be resolvable from either source.
  const flatOptions = [
    ...(options ?? []),
    ...(groups?.flatMap((group) => group.options) ?? []),
  ];
  const selectedOption = flatOptions.find((option) => option.value === value);
  const displayLabel =
    selectedOption?.label ?? placeholder ?? t("providers.select");

  return (
    <AppSelect
      align="end"
      appearance={appearance}
      contentClassName={cn(
        "max-h-72 min-w-[var(--anchor-width)]",
        compact && "min-w-40",
      )}
      disabled={disabled}
      options={options?.map((option) => ({
        value: option.value,
        label: option.label,
      }))}
      sections={groups?.map((group) => ({
        label: group.label,
        options: group.options.map((option) => ({
          value: option.value,
          label: option.label,
        })),
      }))}
      triggerAriaLabel={ariaLabel}
      triggerRadius="control"
      triggerClassName={cn(
        settingsSelectTriggerClassName,
        !selectedOption && "text-muted-foreground",
        className,
      )}
      triggerLabel={displayLabel}
      value={value}
      onValueChange={onChange}
    />
  );
}

interface SettingsSearchableSelectProps {
  ariaLabel: string;
  appearance?: AppDropdownTriggerAppearance;
  className?: string;
  emptyText?: ReactNode;
  options: readonly AppSearchableSelectOption[];
  searchPlaceholder?: string;
  triggerLabel?: ReactNode;
  value: string;
  onChange(value: string): void;
}

// Searchable setting-row select. Same ghost, content-sized trigger as
// SettingsSelect so language / font / model pickers do not grow a boxed field.
export function SettingsSearchableSelect({
  ariaLabel,
  appearance = "ghost",
  className,
  emptyText,
  options,
  searchPlaceholder,
  triggerLabel,
  value,
  onChange,
}: SettingsSearchableSelectProps) {
  return (
    <AppSearchableSelect
      align="end"
      appearance={appearance}
      emptyText={emptyText}
      options={options}
      searchPlaceholder={searchPlaceholder}
      triggerAriaLabel={ariaLabel}
      triggerClassName={cn(settingsSelectTriggerClassName, className)}
      triggerLabel={triggerLabel}
      value={value}
      onValueChange={onChange}
    />
  );
}
