import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AppDropdownRadioList,
  type AppDropdownRadioSection,
} from "@/components";
import {
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  Input,
} from "@/components/ui";

export interface RuntimeAxisOption {
  description?: string | null;
  disabled?: boolean;
  isDefault?: boolean;
  label: string;
  value: string;
}

// Long axes (model lists) get a filter box; short ones (effort, speed,
// permission) stay a plain list.
const SEARCH_THRESHOLD = 10;

function matchesQuery(option: RuntimeAxisOption, query: string) {
  return option.label.toLowerCase().includes(query.toLowerCase());
}

/**
 * One row of a compound runtime menu (model, reasoning effort, speed,
 * permission): the row shows the axis name plus its current value and opens
 * the choices in a submenu, mirroring the Codex model picker.
 */
export function RuntimeAxisSubmenu({
  label,
  options,
  sections,
  showDescriptions = false,
  value,
  onValueChange,
}: {
  label: string;
  /** Flat choices; use `sections` instead when the axis is grouped. */
  options?: readonly RuntimeAxisOption[];
  sections?: readonly AppDropdownRadioSection[];
  /** Off by default: most level names explain themselves. */
  showDescriptions?: boolean;
  value: string;
  onValueChange(value: string): void;
}) {
  const { t } = useTranslation("sessions");
  const [query, setQuery] = useState("");
  const flatOptions =
    options ??
    sections?.flatMap((section) => section.options as RuntimeAxisOption[]) ??
    [];
  // No fallback to the first row: when nothing is selected the axis shows no
  // value, rather than claiming a level the agent was never told to use.
  const currentLabel =
    flatOptions.find((option) => option.value === value)?.label ?? "";
  const hasSearch = flatOptions.length > SEARCH_THRESHOLD;
  const filteredSections: AppDropdownRadioSection[] = (
    sections ?? [{ label: "", options }]
  ).flatMap((section) => {
    const matching = ((section.options ?? []) as RuntimeAxisOption[])
      .filter((option) => !hasSearch || !query || matchesQuery(option, query))
      .map(({ description, isDefault, label, ...option }) => ({
        ...option,
        // The agent's own default is tagged in place instead of getting a
        // separate "default" row that selects nothing.
        label: isDefault ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate">{label}</span>
            <span className="shrink-0 text-meta text-muted-foreground">
              {t("modelMenu.defaultTag")}
            </span>
          </span>
        ) : (
          label
        ),
        ...(showDescriptions ? { description } : {}),
      }));

    return matching.length > 0 ? [{ ...section, options: matching }] : [];
  });

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <span className="flex-1 truncate">{label}</span>
        <span className="max-w-40 truncate text-muted-foreground">
          {currentLabel}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="flex max-h-80 min-w-52 max-w-72 flex-col overflow-hidden">
        {hasSearch ? (
          <Input
            autoFocus
            className="mb-1 h-8 shrink-0"
            placeholder={t("modelMenu.searchPlaceholder")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            // The menu's typeahead would otherwise swallow the keystrokes.
            onKeyDown={(event) => event.stopPropagation()}
          />
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <AppDropdownRadioList
            value={value}
            onValueChange={onValueChange}
            sections={filteredSections}
            closeOnClick={false}
          />
        </div>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
