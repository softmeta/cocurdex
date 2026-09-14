import { describe, expect, it } from "vitest";
import {
  normalizeWorkspaceRootPath,
  normalizeWorkspaceRootPaths,
} from "./workspace-roots";

describe("normalizeWorkspaceRootPath", () => {
  it("keeps an empty path empty instead of inventing the filesystem root", () => {
    expect(normalizeWorkspaceRootPath("")).toBe("");
  });

  it("keeps an explicit filesystem root", () => {
    expect(normalizeWorkspaceRootPath("/")).toBe("/");
  });

  it("strips trailing separators from a real project path", () => {
    expect(normalizeWorkspaceRootPath("/Users/me/project/")).toBe(
      "/Users/me/project",
    );
  });
});

describe("normalizeWorkspaceRootPaths", () => {
  it("drops empty and whitespace-only entries", () => {
    expect(normalizeWorkspaceRootPaths(["", "  "])).toEqual([]);
  });

  it("keeps an explicit filesystem root only when it was provided", () => {
    expect(normalizeWorkspaceRootPaths(["/"])).toEqual(["/"]);
  });
});
