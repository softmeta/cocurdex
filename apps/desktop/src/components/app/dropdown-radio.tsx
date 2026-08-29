import type { ReactNode } from "react";
import { Fragment } from "react";
import {
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@/components/ui";
import { cn } from "@/lib";

/** One selectable row in a compound-menu radio list. */
export interface AppDropdownRadioOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  icon?: ReactNode;
  /** Content before the official radio check (counts, mono ids, …). */
  trailing?: ReactNode;
  /** Force multi-line row layout; defaults to true when `description` is set. */
  multiLine?: boolean;
}

export interface AppDropdownRadioSection {
  label: ReactNode;
  options: readonly AppDropdownRadioOption[];
}

function AppDropdownRadioItem({
  option,
  closeOnClick,
}: {
  option: AppDropdownRadioOption;
  closeOnClick?: boolean;
}) {
  const multiLine = option.multiLine ?? Boolean(option.description);

  return (
    <DropdownMenuRadioItem
      value={option.value}
      disabled={option.disabled}
      closeOnClick={closeOnClick}
      className={multiLine ? "items-start py-1.5" : undefined}
    >
      {option.icon ? (
        <span className={cn("shrink-0 [&_svg]:size-4", multiLine && "mt-0.5")}>
          {option.icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate",
            option.description ? "font-medium" : undefined,
          )}
        >
          {option.label}
        </span>
        {option.description ? (
          <span className="block text-meta leading-4 text-muted-foreground">
            {option.description}
          </span>
        ) : null}
      </span>
      {option.trailing}
    </DropdownMenuRadioItem>
  );
}

/**
 * Official shadcn DropdownMenu radio list for compound menus that mix radios
 * with checkboxes, submenus, or multi-section action rows.
 * Standalone short single-selects must use AppSelect (shadcn Select) instead.
 * Searchable lists must use AppSearchableSelect.
 */
export function AppDropdownRadioList({
  value,
  onValueChange,
  options,
  sections,
  // Default true via DropdownMenuRadioItem; set false for multi-section
  // settings menus that should stay open after a pick.
  closeOnClick,
}: {
  value: string;
  onValueChange(value: string): void;
  options?: readonly AppDropdownRadioOption[];
  sections?: readonly AppDropdownRadioSection[];
  closeOnClick?: boolean;
}) {
  return (
    <DropdownMenuRadioGroup value={value} onValueChange={onValueChange}>
      {options?.map((option) => (
        <AppDropdownRadioItem
          key={option.value}
          option={option}
          closeOnClick={closeOnClick}
        />
      ))}
      {sections?.map((section, sectionIndex) => (
        <Fragment key={String(section.label)}>
          {sectionIndex > 0 || (options && options.length > 0) ? (
            <DropdownMenuSeparator />
          ) : null}
          <DropdownMenuGroup>
            {/* Grouped lists can carry unlabeled groups (single-provider model
                lists); an empty header would just add dead space. */}
            {section.label ? (
              <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                {section.label}
              </DropdownMenuLabel>
            ) : null}
            {section.options.map((option) => (
              <AppDropdownRadioItem
                key={option.value}
                option={option}
                closeOnClick={closeOnClick}
              />
            ))}
          </DropdownMenuGroup>
        </Fragment>
      ))}
    </DropdownMenuRadioGroup>
  );
}
