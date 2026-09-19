import { describe, expect, it } from "vitest";
import {
  resolveFileTreeContextTarget,
  resolveFileTreeTargetPaths,
} from "./file-tree-context-target";

describe("resolveFileTreeContextTarget", () => {
  it("returns no target when the right-click missed every row", () => {
    expect(resolveFileTreeContextTarget(undefined)).toBeNull();
  });

  it("treats the workspace root row as a directory", () => {
    expect(resolveFileTreeContextTarget("")).toEqual({
      relativePath: "",
      isDirectory: true,
    });
  });

  it("reads directories from the trailing slash Pierre rows carry", () => {
    expect(resolveFileTreeContextTarget("apps/")).toEqual({
      relativePath: "apps/",
      isDirectory: true,
    });
  });

  it("keeps file rows relative to the root", () => {
    expect(resolveFileTreeContextTarget("AGENTS.md")).toEqual({
      relativePath: "AGENTS.md",
      isDirectory: false,
    });
  });
});

describe("resolveFileTreeTargetPaths", () => {
  it("resolves the workspace root to itself", () => {
    expect(resolveFileTreeTargetPaths("/ws/cocurdex", "")).toEqual({
      relativePath: "",
      absolutePath: "/ws/cocurdex",
    });
  });

  it("joins a file row onto the root", () => {
    expect(resolveFileTreeTargetPaths("/ws/cocurdex", "AGENTS.md")).toEqual({
      relativePath: "AGENTS.md",
      absolutePath: "/ws/cocurdex/AGENTS.md",
    });
  });

  it("drops the directory marker from both paths", () => {
    expect(resolveFileTreeTargetPaths("/ws/cocurdex", "apps/")).toEqual({
      relativePath: "apps",
      absolutePath: "/ws/cocurdex/apps",
    });
  });
});
