import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DaemonSkillsService } from "./skills-service";

describe("DaemonSkillsService authorization", () => {
  it("rejects project-scoped operations on unregistered roots", async () => {
    const sourceRoot = await mkdtemp(path.join(tmpdir(), "cocurdex-skills-"));
    const service = new DaemonSkillsService(sourceRoot, async () => false);

    await expect(
      service.install({
        scope: "project",
        workspaceRootPath: "/tmp/anywhere",
      }),
    ).rejects.toThrow("not a registered workspace");
    await expect(
      service.install({ scope: "project", workspaceRootPath: null }),
    ).rejects.toThrow("not a registered workspace");
  });

  it("does not require a workspace root for global scope", async () => {
    const sourceRoot = await mkdtemp(path.join(tmpdir(), "cocurdex-skills-"));
    const service = new DaemonSkillsService(sourceRoot, async () => false);

    await expect(
      service.getStatus({ scope: "global", workspaceRootPath: null }),
    ).resolves.toMatchObject({ sourceRoot });
  });
});
