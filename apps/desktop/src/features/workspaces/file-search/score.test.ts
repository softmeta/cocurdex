import { describe, expect, it } from "vitest";
import type { WorkspaceFileEntry } from "@/lib";
import { rankWorkspaceEntries, scoreWorkspaceEntry } from "./score";

function entry(
  relativePath: string,
  kind: WorkspaceFileEntry["kind"] = "directory",
): WorkspaceFileEntry {
  const name = relativePath.split("/").pop() ?? relativePath;
  return {
    kind,
    name,
    path: `/repo/${relativePath}`,
    relativePath,
  };
}

describe("rankWorkspaceEntries", () => {
  it("ranks @apps as a path prefix: the folder, then its children, before filename substrings", () => {
    const ranked = rankWorkspaceEntries(
      [
        entry("apps/api/src"),
        entry("apps/cli"),
        entry("apps/desktop"),
        entry("apps/web"),
        entry("apps"),
        entry("apps/api"),
        entry(
          ".impeccable/critique/apps-desktop-src-2026-05-15-231502.md",
          "file",
        ),
        entry("apps/README.md", "file"),
      ],
      "apps",
    ).map((file) => file.relativePath);

    expect(ranked[0]).toBe("apps");
    expect(ranked.slice(1, 5)).toEqual([
      "apps/api",
      "apps/cli",
      "apps/desktop",
      "apps/web",
    ]);
    expect(ranked.indexOf("apps/api/src")).toBeGreaterThan(
      ranked.indexOf("apps/api"),
    );
    expect(ranked.indexOf("apps/README.md")).toBeGreaterThan(
      ranked.indexOf("apps/web"),
    );
    expect(ranked.at(-1)).toBe(
      ".impeccable/critique/apps-desktop-src-2026-05-15-231502.md",
    );
  });

  it("ranks a nested folder name above its descendants and unrelated substring hits", () => {
    const ranked = rankWorkspaceEntries(
      [
        entry("apps/desktop/src"),
        entry("apps/desktop"),
        entry("apps/cli"),
        entry("desktop.ini", "file"),
      ],
      "desktop",
    ).map((file) => file.relativePath);

    expect(ranked[0]).toBe("apps/desktop");
    expect(ranked[1]).toBe("apps/desktop/src");
    expect(ranked.indexOf("desktop.ini")).toBeGreaterThan(
      ranked.indexOf("apps/desktop/src"),
    );
    expect(ranked).not.toContain("apps/cli");
  });
});

describe("scoreWorkspaceEntry", () => {
  it("returns 0 when the query is empty or unmatched", () => {
    expect(scoreWorkspaceEntry(entry("apps"), "  ")).toBe(0);
    expect(scoreWorkspaceEntry(entry("src"), "apps")).toBe(0);
  });
});
