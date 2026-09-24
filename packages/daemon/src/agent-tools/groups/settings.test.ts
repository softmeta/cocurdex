import type {
  AgentToolCallerContext,
  WorkspaceWorktreeEnvironment,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { AgentToolRegistry } from "../tool-registry";
import {
  registerSettingsTools,
  type SettingsToolDependencies,
} from "./settings";

function caller(
  sessionKind: AgentToolCallerContext["sessionKind"] = "main",
): AgentToolCallerContext {
  return { sessionId: "s", sessionKind, workspaceId: "w", teamId: null };
}

function environment(
  proposal: WorkspaceWorktreeEnvironment["proposal"] = null,
): WorkspaceWorktreeEnvironment {
  return {
    workspaceId: "w",
    setupScript: "npm install",
    cleanupScript: "",
    updatedAt: "2026-09-23T00:00:00.000Z",
    proposal,
  };
}

function registryWith(deps: Partial<SettingsToolDependencies> = {}) {
  const registry = new AgentToolRegistry();
  const unused = async () => {
    throw new Error("not called");
  };
  registerSettingsTools(registry, {
    getWorktreeEnvironment: unused,
    proposeWorktreeEnvironment: unused,
    getSettingValue: unused,
    setSettingValue: unused,
    ...deps,
  });
  return registry;
}

describe("settings agent tools", () => {
  it("lists the catalog for main sessions and hides it from subagents", async () => {
    const tools = registryWith();
    const main = await tools.catalog(caller("main"));
    expect(main.tools.map((tool) => tool.name).sort()).toEqual([
      "get",
      "list",
      "propose",
      "set",
    ]);
    const subagent = await tools.catalog(caller("subagent"));
    expect(subagent.tools).toEqual([]);
  });

  it("reads the current worktree environment and pending proposal", async () => {
    const tools = registryWith({
      getSettingValue: async () => ({
        value: { setupScript: "npm install", cleanupScript: "" },
        pending: {
          setupScript: "pnpm install",
          cleanupScript: "",
          rationale: "pnpm lockfile",
          proposedAt: "2026-09-23T01:00:00.000Z",
        },
      }),
    });
    const result = (await tools.call(caller(), "settings_get", {
      key: "workspace.worktreeEnvironment",
    })) as { value: { setupScript: string }; pending: unknown };
    expect(result.value.setupScript).toBe("npm install");
    expect(result.pending).toMatchObject({ setupScript: "pnpm install" });
  });

  it("rejects unknown settings keys", async () => {
    const tools = registryWith();
    await expect(
      tools.call(caller(), "settings_get", { key: "nope" }),
    ).rejects.toThrow("Unknown settings key");
  });

  it("stores a proposal for the caller's workspace", async () => {
    const proposals: Record<string, unknown>[] = [];
    const tools = registryWith({
      proposeWorktreeEnvironment: async (input) => {
        proposals.push(input as Record<string, unknown>);
        return environment();
      },
    });
    const result = (await tools.call(caller(), "settings_propose", {
      key: "workspace.worktreeEnvironment",
      value: { setupScript: "pnpm install", cleanupScript: "rm -rf .turbo" },
      rationale: "detected pnpm-lock.yaml",
    })) as { status: string };
    expect(result.status).toBe("pending");
    expect(proposals).toEqual([
      {
        workspaceId: "w",
        setupScript: "pnpm install",
        cleanupScript: "rm -rf .turbo",
        rationale: "detected pnpm-lock.yaml",
      },
    ]);
  });

  it("rejects an empty cleanup script so both scripts get a suggestion", async () => {
    const tools = registryWith();
    await expect(
      tools.call(caller(), "settings_propose", {
        key: "workspace.worktreeEnvironment",
        value: { setupScript: "pnpm install", cleanupScript: "   " },
      }),
    ).rejects.toThrow("cleanupScript must not be empty");
  });

  it("rejects malformed proposal values", async () => {
    const tools = registryWith();
    await expect(
      tools.call(caller(), "settings_propose", {
        key: "workspace.worktreeEnvironment",
        value: { setupScript: 1 },
      }),
    ).rejects.toThrow("setupScript");
  });

  it("passes write-tier sets to the service", async () => {
    const sets: Record<string, unknown>[] = [];
    const tools = registryWith({
      setSettingValue: async (input) => {
        sets.push(input as Record<string, unknown>);
        return { status: "queued" };
      },
    });
    const result = (await tools.call(caller(), "settings_set", {
      key: "app.theme",
      value: "dark",
    })) as { status: string };
    expect(result.status).toBe("queued");
    expect(sets).toEqual([
      { key: "app.theme", value: "dark", workspaceId: "w" },
    ]);
  });

  it("rejects settings_set on unknown keys", async () => {
    const tools = registryWith();
    await expect(
      tools.call(caller(), "settings_set", { key: "nope", value: 1 }),
    ).rejects.toThrow("Unknown settings key");
  });
});
