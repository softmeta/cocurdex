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
        { id: "a", name: " Dev ", script: "pnpm dev", platform: "macos" },
        { id: "a", name: "Dup", script: "echo dup", platform: null },
        { id: "b", name: "Empty", script: "   ", platform: null },
        { id: "", name: "No id", script: "echo", platform: null },
        "garbage",
      ]),
    ).toEqual([
      { id: "a", name: "Dev", script: "pnpm dev", platform: "macos" },
    ]);
  });

  it("falls back to the first script line when the name is blank", () => {
    expect(
      normalizeWorkspaceActions([
        { id: "a", name: "", script: "pnpm test\npnpm lint", platform: null },
      ])[0]?.name,
    ).toBe("pnpm test");
  });

  it("treats an unknown platform as all platforms", () => {
    expect(
      normalizeWorkspaceActions([
        { id: "a", name: "A", script: "x", platform: "linux" },
        { id: "b", name: "B", script: "x", platform: "beos" },
      ]).map((action) => action.platform),
    ).toEqual(["linux", null]);
  });

  it("reads malformed stored JSON as no actions", () => {
    expect(parseWorkspaceActionsJson("{not json")).toEqual([]);
    expect(parseWorkspaceActionsJson(null)).toEqual([]);
  });
});
