import { describe, expect, it } from "vitest";
import {
  fromGitTreePath,
  normalizeWorkspaceTreeRootName,
  toGitTreePath,
} from "@/features/editor/git-changes-tree-paths";

describe("git-changes-tree-paths", () => {
  it("normalizes empty or trailing-slash workspace names", () => {
    expect(normalizeWorkspaceTreeRootName("cocurdex")).toBe("cocurdex");
    expect(normalizeWorkspaceTreeRootName("cocurdex/")).toBe("cocurdex");
    expect(normalizeWorkspaceTreeRootName("  ")).toBe("workspace");
  });

  it("prefixes and strips the workspace root for file paths", () => {
    expect(toGitTreePath("cocurdex", "src/a.ts")).toBe("cocurdex/src/a.ts");
    expect(fromGitTreePath("cocurdex", "cocurdex/src/a.ts")).toBe("src/a.ts");
  });

  it("rejects the root directory row and foreign prefixes", () => {
    expect(fromGitTreePath("cocurdex", "cocurdex/")).toBeNull();
    expect(fromGitTreePath("cocurdex", "other/src/a.ts")).toBeNull();
  });
});
