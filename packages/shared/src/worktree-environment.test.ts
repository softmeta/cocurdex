import { describe, expect, it } from "vitest";
import {
  emptyWorktreeEnvironment,
  suggestWorktreeSetupScript,
} from "./worktree-environment";

describe("suggestWorktreeSetupScript", () => {
  it("prefers pnpm when a pnpm lockfile is present", () => {
    expect(suggestWorktreeSetupScript(["package.json", "pnpm-lock.yaml"])).toBe(
      "pnpm install",
    );
  });

  it("uses npm when only package.json is present", () => {
    expect(suggestWorktreeSetupScript(["package.json"])).toBe("npm install");
  });

  it("returns an empty script when no known project files exist", () => {
    expect(suggestWorktreeSetupScript(["README.md"])).toBe("");
  });
});

describe("emptyWorktreeEnvironment", () => {
  it("returns blank scripts for a workspace", () => {
    expect(emptyWorktreeEnvironment("workspace-1")).toEqual({
      workspaceId: "workspace-1",
      setupScript: "",
      cleanupScript: "",
      updatedAt: null,
    });
  });
});
