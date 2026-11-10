import type { SettingsSectionId } from "@/app/layout/app-shell/app-shell-types";
import type { SettingsSearchSectionResult } from "./settings-search";

export interface SettingsSearchTarget {
  section: SettingsSectionId;
  settingId: string | null;
  fallbackId?: string;
}

export function flattenSettingsSearchResults(
  results: readonly SettingsSearchSectionResult[],
): SettingsSearchTarget[] {
  return results.flatMap((result) => [
    { section: result.section, settingId: null },
    ...result.settings.map((setting) => ({
      section: result.section,
      settingId: setting.id,
      fallbackId: setting.fallbackId,
    })),
  ]);
}

export function stepSettingsSearchTarget(
  targets: readonly SettingsSearchTarget[],
  current: number,
  delta: number,
): number {
  if (targets.length === 0) return -1;
  if (current < 0) return delta > 0 ? 0 : targets.length - 1;
  return (current + delta + targets.length) % targets.length;
}
