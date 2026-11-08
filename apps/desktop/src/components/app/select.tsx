import type { ReactElement, ReactNode } from "react";
import { Fragment, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
} from "@/components/ui";
import { cn } from "@/lib";
import {
  type AppDropdownTriggerAppearance,
  AppDropdownTriggerButton,
  AppDropdownTriggerLabel,
  type AppDropdownTriggerRadius,
} from "./dropdown";

export interface AppSelectOption {
  value: string;
  label: ReactNode;
  textValue?: string;
  description?: ReactNode;
  disabled?: boolean;
  icon?: ReactNode;
  trailing?: ReactNode;
  multiLine?: boolean;
}

export interface AppSelectSection {
  label?: ReactNode;
  options: readonly AppSelectOption[];
}

function optionTextValue(option: AppSelectOption): string {
  if (option.textValue) return option.textValue;
  if (typeof option.label === "string" || typeof option.label === "number") {
    return String(option.label);
  }
  return option.value;
}

function AppSelectItemRow({ option }: { option: AppSelectOption }) {
  const multiLine = option.multiLine ?? Boolean(option.description);

  return (
    <SelectItem
      value={option.value}
      disabled={option.disabled}
      className={
        multiLine
          ? "items-start py-1.5 [&_[data-slot=select-item-text]]:items-start"
          : undefined
      }
    >
      {option.icon ? (
        <span
          className={cn(
            "shrink-0 [&_svg:not([class*='size-'])]:size-4",
            multiLine && "mt-0.5",
          )}
        >
          {option.icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span
            className={cn(
              "min-w-0 truncate",
              option.description ? "font-medium" : undefined,
            )}
          >
            {option.label}
          </span>
          {option.trailing ? (
            <span className="shrink-0 tabular-nums">{option.trailing}</span>
          ) : null}
        </span>
        {option.description ? (
          <span className="block text-meta leading-4 text-muted-foreground">
            {option.description}
          </span>
        ) : null}
      </span>
    </SelectItem>
  );
}

export interface AppSelectProps {
  value: string;
  onValueChange(value: string): void;
  options?: readonly AppSelectOption[];
  sections?: readonly AppSelectSection[];
  triggerLabel?: ReactNode;
  triggerAriaLabel?: string;
  appearance?: AppDropdownTriggerAppearance;
  triggerRadius?: AppDropdownTriggerRadius;
  disabled?: boolean;
  triggerClassName?: string;
  chevronClassName?: string;
  showChevron?: boolean;
  contentClassName?: string;
  align?: React.ComponentProps<typeof SelectContent>["align"];
  side?: React.ComponentProps<typeof SelectContent>["side"];
  position?: React.ComponentProps<typeof SelectContent>["position"];
  trigger?: ReactElement;
  empty?: ReactNode;
  placeholder?: ReactNode;
}

export function AppSelect({
  value,
  onValueChange,
  options,
  sections,
  triggerLabel,
  triggerAriaLabel,
  appearance = "outline",
  triggerRadius = "control",
  disabled = false,
  triggerClassName,
  chevronClassName,
  showChevron = true,
  contentClassName,
  align = "start",
  side,
  position = "popper",
  trigger,
  empty,
  placeholder,
}: AppSelectProps) {
  const flatOptions = useMemo(() => {
    const fromSections = sections?.flatMap((section) => section.options) ?? [];
    return [...(options ?? []), ...fromSections];
  }, [options, sections]);

  const hasChoices = flatOptions.length > 0;

  const items = useMemo(
    () =>
      flatOptions.map((option) => ({
        value: option.value,
        label: optionTextValue(option),
      })),
    [flatOptions],
  );

  const selected = flatOptions.find((option) => option.value === value);
  const resolvedTriggerLabel =
    triggerLabel ?? selected?.label ?? placeholder ?? "";

  return (
    <Select
      disabled={disabled || !hasChoices}
      items={items}
      value={hasChoices ? value : null}
      onValueChange={(next) => {
        if (typeof next !== "string") return;
        onValueChange(next);
      }}
    >
      <SelectTrigger
        aria-label={triggerAriaLabel}
        disabled={disabled || !hasChoices}
        showIcon={false}
        size="sm"
        render={
          trigger ?? (
            <AppDropdownTriggerButton
              appearance={appearance}
              className={triggerClassName}
              chevronClassName={chevronClassName}
              disabled={disabled || !hasChoices}
              radius={triggerRadius}
              showChevron={showChevron}
            />
          )
        }
      >
        {typeof resolvedTriggerLabel === "string" ||
        typeof resolvedTriggerLabel === "number" ? (
          <AppDropdownTriggerLabel>
            {resolvedTriggerLabel}
          </AppDropdownTriggerLabel>
        ) : (
          resolvedTriggerLabel
        )}
      </SelectTrigger>
      <SelectContent
        align={align}
        className={contentClassName}
        position={position}
        side={side}
      >
        {hasChoices ? (
          <>
            {options && options.length > 0 ? (
              <SelectGroup>
                {options.map((option) => (
                  <AppSelectItemRow key={option.value} option={option} />
                ))}
              </SelectGroup>
            ) : null}
            {sections?.map((section, sectionIndex) => (
              <Fragment
                key={section.options[0]?.value ?? String(section.label)}
              >
                {sectionIndex > 0 || (options && options.length > 0) ? (
                  <SelectSeparator />
                ) : null}
                <SelectGroup>
                  {section.label ? (
                    <SelectLabel>{section.label}</SelectLabel>
                  ) : null}
                  {section.options.map((option) => (
                    <AppSelectItemRow key={option.value} option={option} />
                  ))}
                </SelectGroup>
              </Fragment>
            ))}
          </>
        ) : empty ? (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">
            {empty}
          </div>
        ) : null}
      </SelectContent>
    </Select>
  );
}
