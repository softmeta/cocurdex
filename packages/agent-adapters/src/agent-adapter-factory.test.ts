import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setInstalledAcpRegistryAgents } from "@cocurdex/agent-core";
import { toAcpRegistryAgentId } from "@cocurdex/shared";
import { afterEach, describe, expect, it } from "vitest";
import { createAgentAdapter } from "./agent-adapter-factory";

function installRegistryAgents(registryIds: string[]) {
  setInstalledAcpRegistryAgents(
    registryIds.map((registryId) => ({
      agentId: toAcpRegistryAgentId(registryId),
      registryId,
      name: registryId,
      version: "1.0.0",
      description: null,
      distribution: "binary",
      command: registryId,
      args: ["acp"],
      env: {},
      installedAt: "2026-10-05T00:00:00.000Z",
    })),
  );
}

describe("createAgentAdapter", () => {
  afterEach(() => setInstalledAcpRegistryAgents([]));

  it("provides standard skill discovery for every registered agent", async () => {
    installRegistryAgents(["cursor", "devin", "grok-build"]);
    const agentIds = [
      "claude-agent",
      "codex",
      "acp:cursor",
      "acp:devin",
      "acp:grok-build",
      "opencode",
      "pi",
    ] as const;
    const rootPath = await mkdtemp(path.join(tmpdir(), "cocurdex-adapters-"));
    const workspaceRootPath = path.join(rootPath, "workspace");
    const skillPath = path.join(
      workspaceRootPath,
      ".agents",
      "skills",
      "shared-review",
    );
    await mkdir(skillPath, { recursive: true });
    await writeFile(
      path.join(skillPath, "SKILL.md"),
      "---\nname: shared-review\ndescription: Review shared behavior\n---\n",
      "utf8",
    );

    for (const agentId of agentIds) {
      const adapter = createAgentAdapter(agentId);
      expect(adapter.getDescriptor().id).toBe(agentId);
      expect(adapter.listSlashCommands).toBeTypeOf("function");
      const skills = await adapter.listSlashCommands?.({
        workspaceRootPath,
        userDataPath: path.join(rootPath, "user-data"),
      });
      expect(skills).toContainEqual(
        expect.objectContaining({
          name: "shared-review",
          source: "skill",
        }),
      );
    }
  });

  it("keeps on-demand session mode discovery for ACP registry agents", () => {
    installRegistryAgents(["devin"]);

    expect(createAgentAdapter("acp:devin").discoverSessionModes).toBeTypeOf(
      "function",
    );
  });
});
