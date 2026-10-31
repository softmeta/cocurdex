import type { ProductSkillScope } from "@cocurdex/shared";
import useSWR from "swr";
import { desktopApi } from "@/lib";
import type { ProductSkillsStatus } from "@/lib/types";
import type { SkillDotState } from "./skill-library-model";
import { DAEMON_READ_OPTIONS } from "./skill-queries";

export type SkillPackStatuses = Partial<
  Record<ProductSkillScope, ProductSkillsStatus>
>;

export interface SkillPackState {
  statuses: SkillPackStatuses;
  isLoaded: boolean;
  workspaceRootPath: string | null;
  refresh(): Promise<void>;
  setStatus(scope: ProductSkillScope, status: ProductSkillsStatus): void;
}

export function packDotState(
  statuses: SkillPackStatuses,
): SkillDotState | null {
  const all = Object.values(statuses);
  if (all.some((status) => status.conflict)) {
    return "problem";
  }
  if (all.some((status) => status.installed && status.updateAvailable)) {
    return "update";
  }
  return all.some((status) => status.installed) ? "ok" : null;
}

async function loadPackStatuses(
  workspaceRootPath: string | null,
): Promise<SkillPackStatuses> {
  const [global, project] = await Promise.all([
    desktopApi.getProductSkillsStatus("global"),
    workspaceRootPath
      ? desktopApi.getProductSkillsStatus("project", workspaceRootPath)
      : null,
  ]);
  return project ? { global, project } : { global };
}

export function useSkillPack(workspaceRootPath: string | null): SkillPackState {
  const query = useSWR(
    ["skills.pack.getStatus", workspaceRootPath],
    () => loadPackStatuses(workspaceRootPath),
    DAEMON_READ_OPTIONS,
  );

  const refresh = async () => {
    await query.mutate();
  };

  const setStatus = (scope: ProductSkillScope, status: ProductSkillsStatus) => {
    void query.mutate((current) => ({ ...current, [scope]: status }), {
      revalidate: false,
    });
  };

  return {
    statuses: query.data ?? {},
    isLoaded: query.data !== undefined || query.error !== undefined,
    workspaceRootPath,
    refresh,
    setStatus,
  };
}
