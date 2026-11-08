import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AppDropdownRadioList,
  type AppDropdownRadioSection,
} from "@/components";
import {
  DropdownMenuEmpty,
  DropdownMenuSearchInput,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui";

export interface RuntimeAxisOption {
  description?: string | null;
  disabled?: boolean;
  isDefault?: boolean;
  label: string;
  value: string;
}

const SEARCH_THRESHOLD = 10;

function matchesQuery(option: RuntimeAxisOption, query: string) {
  return option.label.toLowerCase().includes(query.toLowerCase());
}

export function RuntimeAxisSubmenu({
  inspectOnly = false,
  label,
  options,
  sections,
  showDescriptions = false,
  value,
  onValueChange,
}: {
  inspectOnly?: boolean;
  label: string;
  options?: readonly RuntimeAxisOption[];
  sections?: readonly AppDropdownRadioSection[];
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
      <DropdownMenuSubContent className="flex max-h-80 [--popup-max-width:18rem] flex-col overflow-hidden">
        {hasSearch ? (
          <DropdownMenuSearchInput
            placeholder={t("modelMenu.searchPlaceholder")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <AppDropdownRadioList
            inspectOnly={inspectOnly}
            value={value}
            onValueChange={onValueChange}
            sections={filteredSections}
            closeOnClick={false}
          />
          {hasSearch && filteredSections.length === 0 ? (
            <DropdownMenuEmpty>{t("modelMenu.empty")}</DropdownMenuEmpty>
          ) : null}
        </div>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
