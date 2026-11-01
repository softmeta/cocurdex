import {
  HOST_ACCESS_SCOPES,
  PAIRABLE_HOST_ACCESS_SCOPES,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  groupSettingsSectionsByCluster,
  permittedSettingsSection,
} from "@/features/settings/settings-sections";

function visibleSections(
  scopes: readonly (typeof HOST_ACCESS_SCOPES)[number][],
) {
  return groupSettingsSectionsByCluster(scopes).flatMap((group) =>
    group.items.map((item) => item.id),
  );
}

describe("settings sections by device scope", () => {
  it("shows every section to the local user", () => {
    expect(visibleSections(HOST_ACCESS_SCOPES)).toEqual(
      expect.arrayContaining([
        "environment",
        "devices",
        "diagnostics",
        "providers",
      ]),
    );
  });

  it("hides host administration from a fully paired device", () => {
    const sections = visibleSections(PAIRABLE_HOST_ACCESS_SCOPES);
    expect(sections).toEqual(
      expect.arrayContaining([
        "general",
        "appearance",
        "providers",
        "workspaces",
      ]),
    );
    expect(sections).toContain("devices");
    for (const id of ["environment", "diagnostics", "adapters", "memory"]) {
      expect(sections).not.toContain(id);
    }
  });

  it("keeps interface sections for a read-only device", () => {
    expect(visibleSections(["read"])).toEqual([
      "general",
      "appearance",
      "editor",
      "shortcuts",
      "devices",
      "licenses",
      "about",
      "archived",
    ]);
  });

  it("sends a device away from a section it may not open", () => {
    expect(permittedSettingsSection("environment", ["read"])).toBe("general");
    expect(permittedSettingsSection("environment", HOST_ACCESS_SCOPES)).toBe(
      "environment",
    );
    expect(permittedSettingsSection("workflows", ["read"])).toBe("workflows");
  });
});
