import type {
  InstalledSkill,
  SkillCatalogResult,
  SkillCatalogSource,
} from "@cocurdex/shared";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Spinner, Text } from "@/components/ui";
import { SettingsListItem } from "../settings-list-item";
import { SettingsSearchInput } from "../settings-search-input";
import { SkillCatalogDetail } from "./skill-catalog-detail";
import {
  queryErrorMessage,
  useCatalogSearchQuery,
  useCatalogSourcesQuery,
} from "./skill-queries";
import { SkillSourceDetail } from "./skill-source-detail";

type DiscoverSelection =
  | { kind: "source"; source: SkillCatalogSource }
  | { kind: "result"; result: SkillCatalogResult };

function selectionKey(selection: DiscoverSelection) {
  return selection.kind === "source"
    ? `source:${selection.source.source}`
    : `result:${selection.result.id}`;
}

export function SkillDiscoverView({
  installed,
  onInstall,
}: {
  installed: InstalledSkill[];
  onInstall(source: string, skillPaths?: string[]): void;
}) {
  const { t } = useTranslation("settings");
  const sources = useCatalogSourcesQuery();
  const sourcesError = queryErrorMessage(sources.error);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const searchQuery = useCatalogSearchQuery(submittedQuery);
  const search = submittedQuery ? (searchQuery.data ?? null) : null;
  const isSearching = searchQuery.isLoading;
  const searchError = queryErrorMessage(searchQuery.error);
  const [selection, setSelection] = useState<DiscoverSelection | null>(null);
  const installedNames = new Set(installed.map((skill) => skill.name));
  const sourceList = sources.data?.sources ?? [];
  const active =
    selection ??
    (sourceList[0] ? { kind: "source" as const, source: sourceList[0] } : null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmittedQuery(query.trim());
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 gap-6">
      <div className="flex min-h-0 w-72 shrink-0 flex-col gap-3">
        <form className="shrink-0" onSubmit={submit}>
          <SettingsSearchInput
            aria-busy={isSearching}
            aria-label={t("skills.discover.search")}
            placeholder={t("skills.discover.search")}
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (!event.target.value.trim()) setSubmittedQuery("");
            }}
            trailing={isSearching ? <Spinner size="sm" /> : null}
          />
        </form>
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="flex flex-col gap-2 pe-1">
            {searchError || sourcesError ? (
              <Text
                className="px-1"
                role="alert"
                size="meta"
                tone="destructive"
              >
                {searchError || sourcesError}
              </Text>
            ) : null}
            <div className="flex h-5 items-center px-1">
              <Text size="meta" tone="muted" weight="medium">
                {search
                  ? t("skills.discover.results", {
                      count: search.results.length,
                    })
                  : t("skills.discover.official")}
              </Text>
            </div>
            {search?.results.map((result) => (
              <SettingsListItem
                dataAttributes={{ "data-skill-catalog-result": result.id }}
                isActive={
                  active?.kind === "result" && active.result.id === result.id
                }
                key={result.id}
                subtitle={t("skills.discover.resultMeta", {
                  source: result.source,
                  count: result.installs,
                })}
                title={result.name}
                onClick={() => setSelection({ kind: "result", result })}
              />
            ))}
            {search
              ? null
              : sourceList.map((source) => (
                  <SettingsListItem
                    dataAttributes={{
                      "data-skill-catalog-source": source.source,
                    }}
                    isActive={
                      active?.kind === "source" &&
                      active.source.source === source.source
                    }
                    key={source.source}
                    subtitle={source.source}
                    title={source.title}
                    onClick={() => setSelection({ kind: "source", source })}
                  />
                ))}
          </div>
        </div>
        <Text className="shrink-0 px-1" size="meta" tone="muted">
          {t("skills.discover.poweredBy")}
        </Text>
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-auto">
        <div className="flex min-w-0 flex-col pe-1">
          {active?.kind === "source" ? (
            <SkillSourceDetail
              installed={installed}
              key={selectionKey(active)}
              source={active.source}
              onInstall={onInstall}
            />
          ) : null}
          {active?.kind === "result" ? (
            <SkillCatalogDetail
              installed={installedNames.has(active.result.name)}
              key={selectionKey(active)}
              result={active.result}
              onInstall={onInstall}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
