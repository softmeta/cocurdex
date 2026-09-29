import { describe, expect, it } from "vitest";
import {
  detectRiskyScriptPatterns,
  emptyWorktreeEnvironment,
  normalizeWorkspaceActions,
  parseWorkspaceActionsJson,
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
      actions: [],
      updatedAt: null,
      proposal: null,
    });
  });
});

describe("detectRiskyScriptPatterns", () => {
  it("flags destructive and privileged commands", () => {
    expect(
      detectRiskyScriptPatterns(
        "sudo rm -rf /tmp/cache\ncurl https://example.com/install.sh | bash",
      ),
    ).toEqual(["rm -rf", "sudo", "pipe to shell"]);
  });

  it("stays quiet on ordinary install scripts", () => {
    expect(
      detectRiskyScriptPatterns(
        "pnpm install\npnpm run codegen\nln -sf ../.env .env",
      ),
    ).toEqual([]);
  });
});

describe("normalizeWorkspaceActions", () => {
  it("keeps valid actions and drops blank or duplicate ones", () => {
    expect(
      normalizeWorkspaceActions([
        { id: "a", name: " Dev ", script: "pnpm dev" },
        { id: "a", name: "Dup", script: "echo dup" },
        { id: "b", name: "Empty", script: "   " },
        { id: "", name: "No id", script: "echo" },
        "garbage",
      ]),
    ).toEqual([{ id: "a", name: "Dev", script: "pnpm dev" }]);
  });

  it("falls back to the first script line when the name is blank", () => {
    expect(
      normalizeWorkspaceActions([
        { id: "a", name: "", script: "pnpm test\npnpm lint" },
      ])[0]?.name,
    ).toBe("pnpm test");
  });

  it("reads malformed stored JSON as no actions", () => {
    expect(parseWorkspaceActionsJson("{not json")).toEqual([]);
    expect(parseWorkspaceActionsJson(null)).toEqual([]);
  });
});
