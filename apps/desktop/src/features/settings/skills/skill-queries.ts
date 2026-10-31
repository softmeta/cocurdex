import type { SkillCatalogResult, SkillRef } from "@cocurdex/shared";
import useSWR from "swr";
import useSWRImmutable from "swr/immutable";
import { skillsApi } from "./skills-api";

export const DAEMON_READ_OPTIONS = { dedupingInterval: 0 };

export function queryErrorMessage(error: unknown) {
  if (!error) {
    return "";
  }
  return error instanceof Error ? error.message : String(error);
}

export function skillDetailKey(ref: SkillRef) {
  return ["skills.show", ref.scope, ref.workspaceId ?? null, ref.name] as const;
}

export function useSkillDetailQuery(ref: SkillRef) {
  return useSWR(
    skillDetailKey(ref),
    () => skillsApi.show(ref),
    DAEMON_READ_OPTIONS,
  );
}

export function usePackSkillQuery(name: string) {
  return useSWR(
    ["skills.pack.show", name],
    () => skillsApi.showPackSkill(name),
    DAEMON_READ_OPTIONS,
  );
}

export function useCatalogSourcesQuery() {
  return useSWRImmutable("skills.catalog.sources", () =>
    skillsApi.catalogSources(),
  );
}

export function useCatalogSearchQuery(query: string) {
  return useSWRImmutable(query ? ["skills.catalog.search", query] : null, () =>
    skillsApi.search(query),
  );
}

export function useSourceSnapshotQuery(source: string) {
  return useSWRImmutable(["skills.source.inspect", source], () =>
    skillsApi.inspectSource({ source }),
  );
}

export function useCatalogSkillQuery(result: SkillCatalogResult) {
  return useSWRImmutable(["skills.catalog.skill", result.id], () =>
    loadCatalogSkill(result),
  );
}

async function loadCatalogSkill(result: SkillCatalogResult) {
  const snapshot = await skillsApi.inspectSource({ source: result.source });
  const skill =
    snapshot.skills.find((entry) => entry.name === result.skillId) ??
    snapshot.skills.find((entry) => entry.name === result.name);
  if (!skill) {
    throw new Error(`${result.name} is no longer in ${result.source}`);
  }
  const [detail, audit] = await Promise.all([
    skillsApi.showSourceSkill({
      source: result.source,
      skillPath: skill.skillPath,
    }),
    skillsApi
      .audit({ source: result.source, skillIds: [result.skillId] })
      .catch(() => null),
  ]);
  return { detail, findings: audit?.audits[0]?.findings ?? [] };
}
