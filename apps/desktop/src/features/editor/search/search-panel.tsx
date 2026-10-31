import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  CaseSensitive,
  ChevronsDownUp,
  ChevronsUpDown,
  ListX,
  MoreHorizontal,
  Regex,
  WholeWord,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { TitlebarIconButton } from "@/app/layout/titlebar-icon-button";
import {
  Input,
  Text,
  Toggle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import {
  collapsedSearchPathsAtom,
  searchCaseSensitiveAtom,
  searchErrorAtom,
  searchExcludeAtom,
  searchIncludeAtom,
  searchResultCountAtom,
  searchResultFileCountAtom,
  searchResultsAtom,
  searchStatusAtom,
  searchUseRegexAtom,
  searchWholeWordAtom,
  useWorkspaceSearch,
} from "./search-store";

interface SearchPanelProps {
  rootPath: string | null;
}

// In-input icon toggle with a hover tooltip. Kept as a single component so the
// option toggles and the filter toggle share one layout/markup definition.
function IconToggle({
  className,
  icon,
  label,
  onPressedChange,
  pressed,
}: {
  className: string;
  icon: ReactNode;
  label: string;
  onPressedChange: (pressed: boolean) => void;
  pressed: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Toggle
            aria-label={label}
            className={className}
            onPressedChange={onPressedChange}
            pressed={pressed}
          >
            {icon}
          </Toggle>
        }
      />
      <TooltipContent side="top" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

// Result-toolbar action — same chrome footprint as titlebar / panel icons.
function ToolButton({
  disabled,
  icon,
  label,
  onClick,
}: {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <TitlebarIconButton
      tooltipSide="top"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
    </TitlebarIconButton>
  );
}

export function SearchPanel({ rootPath }: SearchPanelProps) {
  const { t } = useTranslation("search");
  const { query, setQuery } = useWorkspaceSearch(rootPath);
  const [caseSensitive, setCaseSensitive] = useAtom(searchCaseSensitiveAtom);
  const [wholeWord, setWholeWord] = useAtom(searchWholeWordAtom);
  const [useRegex, setUseRegex] = useAtom(searchUseRegexAtom);
  const [include, setInclude] = useAtom(searchIncludeAtom);
  const [exclude, setExclude] = useAtom(searchExcludeAtom);
  // Auto-expand the filter fields when a glob is already set so users see them.
  const [filtersExpanded, setFiltersExpanded] = useState(
    () => include.trim() !== "" || exclude.trim() !== "",
  );
  const status = useAtomValue(searchStatusAtom);
  const error = useAtomValue(searchErrorAtom);
  const resultCount = useAtomValue(searchResultCountAtom);
  const resultFileCount = useAtomValue(searchResultFileCountAtom);
  const results = useAtomValue(searchResultsAtom);
  const setCollapsedPaths = useSetAtom(collapsedSearchPathsAtom);
  const collapsedPaths = useAtomValue(collapsedSearchPathsAtom);

  // Option toggles live inside the input. Base UI's Toggle exposes pressed
  // state via aria-pressed/data-pressed (not data-state), so the active
  // highlight keys off those.
  // Toggle's default size variant ships `min-w-8 px-2.5`; without min-w-0 the
  // 18px square gets stretched to 32px and the icons eat half the input.
  const hasQuery = query.trim() !== "";
  const hasResults = resultCount > 0;
  const resultPaths = [...results.keys()];
  // Every group collapsed → the toggle should expand all; otherwise collapse all.
  const allCollapsed =
    resultPaths.length > 0 &&
    resultPaths.every((path) => collapsedPaths.has(path));

  function handleClearSearch() {
    setQuery("");
  }

  function handleToggleAllGroups() {
    setCollapsedPaths(allCollapsed ? new Set() : new Set(resultPaths));
  }

  return (
    <div className="app-no-drag flex min-w-0 flex-col gap-1.5">
      <div className="relative min-w-0">
        <Input
          aria-label={t("fullText.inputLabel")}
          className="min-w-0 rounded-control border-editor-border bg-editor-canvas px-2.5 text-body placeholder:text-editor-fg-subtle h-8 pe-20"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("fullText.placeholder")}
          value={query}
        />
        <div className="absolute inset-y-0 end-1 flex items-center gap-0">
          <IconToggle
            className="app-no-drag size-[18px] min-w-0 rounded-control p-0 text-editor-fg-subtle transition-colors hover:bg-editor-tab-hover-bg hover:text-editor-fg aria-pressed:bg-transparent aria-pressed:text-primary data-pressed:bg-transparent data-pressed:text-primary"
            icon={<CaseSensitive className="size-3.5" />}
            label={t("fullText.caseSensitive")}
            onPressedChange={setCaseSensitive}
            pressed={caseSensitive}
          />
          <IconToggle
            className="app-no-drag size-[18px] min-w-0 rounded-control p-0 text-editor-fg-subtle transition-colors hover:bg-editor-tab-hover-bg hover:text-editor-fg aria-pressed:bg-transparent aria-pressed:text-primary data-pressed:bg-transparent data-pressed:text-primary"
            icon={<WholeWord className="size-3.5" />}
            label={t("fullText.wholeWord")}
            onPressedChange={setWholeWord}
            pressed={wholeWord}
          />
          <IconToggle
            className="app-no-drag size-[18px] min-w-0 rounded-control p-0 text-editor-fg-subtle transition-colors hover:bg-editor-tab-hover-bg hover:text-editor-fg aria-pressed:bg-transparent aria-pressed:text-primary data-pressed:bg-transparent data-pressed:text-primary"
            icon={<Regex className="size-3.5" />}
            label={t("fullText.useRegex")}
            onPressedChange={setUseRegex}
            pressed={useRegex}
          />
          <IconToggle
            className="app-no-drag size-[18px] min-w-0 rounded-control p-0 text-editor-fg-subtle transition-colors hover:bg-editor-tab-hover-bg hover:text-editor-fg aria-pressed:bg-transparent aria-pressed:text-primary data-pressed:bg-transparent data-pressed:text-primary ms-0.5"
            icon={<MoreHorizontal className="size-3.5" />}
            label={t("fullText.toggleFilters")}
            onPressedChange={setFiltersExpanded}
            pressed={filtersExpanded}
          />
        </div>
      </div>
      {filtersExpanded ? (
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex min-w-0 flex-col gap-0.5">
            <Text className="ps-0.5" size="meta" tone="muted">
              {t("fullText.filesToInclude")}
            </Text>
            <Input
              aria-label={t("fullText.filesToInclude")}
              className="min-w-0 rounded-control border-editor-border bg-editor-canvas px-2.5 text-body placeholder:text-editor-fg-subtle h-8"
              onChange={(event) => setInclude(event.target.value)}
              placeholder={t("fullText.globPlaceholder")}
              value={include}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <Text className="ps-0.5" size="meta" tone="muted">
              {t("fullText.filesToExclude")}
            </Text>
            <Input
              aria-label={t("fullText.filesToExclude")}
              className="min-w-0 rounded-control border-editor-border bg-editor-canvas px-2.5 text-body placeholder:text-editor-fg-subtle h-8"
              onChange={(event) => setExclude(event.target.value)}
              placeholder={t("fullText.globPlaceholder")}
              value={exclude}
            />
          </div>
        </div>
      ) : null}
      {hasQuery ? (
        <div className="flex min-h-7 items-center justify-between gap-2 ps-0.5">
          <div className="min-w-0">
            {status === "error" ? (
              <Text
                className="text-destructive"
                size="meta"
                title={error ?? ""}
                truncate
              >
                {error ?? t("fullText.error")}
              </Text>
            ) : (
              <Text className="tabular-nums" size="meta" tone="muted">
                {t("fullText.resultsInFiles", {
                  count: resultCount,
                  fileCount: String(resultFileCount),
                })}
              </Text>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-0">
            <ToolButton
              icon={<ListX className="size-3.5" />}
              label={t("fullText.clearResults")}
              onClick={handleClearSearch}
            />
            <ToolButton
              disabled={!hasResults}
              icon={
                allCollapsed ? (
                  <ChevronsUpDown className="size-3.5" />
                ) : (
                  <ChevronsDownUp className="size-3.5" />
                )
              }
              label={
                allCollapsed
                  ? t("fullText.expandAll")
                  : t("fullText.collapseAll")
              }
              onClick={handleToggleAllGroups}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
