import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createAgentAdapter } from "./agent-adapter-factory";

describe("createAgentAdapter", () => {
  it("provides standard skill discovery for every registered agent", async () => {
    const agentIds = [
      "claude-agent",
      "codex",
      "grok-build",
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
});
