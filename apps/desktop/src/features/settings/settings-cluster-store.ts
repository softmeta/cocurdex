import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type { SettingsSectionId } from "@/app/layout/app-shell/app-shell-types";
import {
  type SettingsClusterId,
  settingsClusters,
  settingsSections,
} from "./settings-sections";

const COLLAPSED_CLUSTERS_STORAGE_KEY =
  "cocurdex.settings.collapsed-sidebar-clusters";

function normalizeCollapsedClusterIds(value: unknown): SettingsClusterId[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is SettingsClusterId =>
    (settingsClusters as readonly string[]).includes(item as string),
  );
}

const storedCollapsedClusterIdsAtom = atomWithStorage<unknown>(
  COLLAPSED_CLUSTERS_STORAGE_KEY,
  [],
  undefined,
  { getOnInit: true },
);

export const collapsedSettingsClusterIdsAtom = atom((get) =>
  normalizeCollapsedClusterIds(get(storedCollapsedClusterIdsAtom)),
);

export const toggleSettingsClusterCollapsedAtom = atom(
  null,
  (get, set, clusterId: SettingsClusterId) => {
    const current = get(collapsedSettingsClusterIdsAtom);
    const next = current.includes(clusterId)
      ? current.filter((id) => id !== clusterId)
      : [...current, clusterId];
    set(storedCollapsedClusterIdsAtom, next);
  },
);

export const expandSettingsClusterForSectionAtom = atom(
  null,
  (get, set, sectionId: SettingsSectionId) => {
    const clusterId = settingsSections.find(
      (section) => section.id === sectionId,
    )?.cluster;
    if (!clusterId || clusterId === "hidden") {
      return;
    }
    const current = get(collapsedSettingsClusterIdsAtom);
    if (current.includes(clusterId)) {
      set(
        storedCollapsedClusterIdsAtom,
        current.filter((id) => id !== clusterId),
      );
    }
  },
);
