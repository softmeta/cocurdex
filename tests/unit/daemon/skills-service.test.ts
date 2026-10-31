import { DaemonSkillsService } from "@cocurdex/daemon/internal/skills-service";
import {
  getDefaultSkillsSourceRoot,
  PRODUCT_SKILL_NAMES,
} from "@cocurdex/product-skills";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();

afterAll(() => tempDirs.cleanup());

describe("DaemonSkillsService authorization", () => {
  it("rejects project-scoped operations on unregistered roots", async () => {
    const sourceRoot = await tempDirs.create("cocurdex-skills-");
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
    const sourceRoot = await tempDirs.create("cocurdex-skills-");
    const service = new DaemonSkillsService(sourceRoot, async () => false);

    await expect(
      service.getStatus({ scope: "global", workspaceRootPath: null }),
    ).resolves.toMatchObject({ sourceRoot });
  });
});

describe("DaemonSkillsService pack contents", () => {
  it("lists every bundled skill with its description", async () => {
    const service = new DaemonSkillsService(getDefaultSkillsSourceRoot());
    const status = await service.getStatus({
      scope: "global",
      workspaceRootPath: null,
    });
    expect(status.sourceAvailable).toBe(true);
    expect(status.packSkills.map((skill) => skill.name)).toEqual([
      ...PRODUCT_SKILL_NAMES,
    ]);
    expect(status.packSkills.every((skill) => skill.description)).toBe(true);
  });

  it("reports a missing source instead of an empty pack", async () => {
    const sourceRoot = await tempDirs.create("cocurdex-skills-");
    const service = new DaemonSkillsService(sourceRoot);
    const status = await service.getStatus({
      scope: "global",
      workspaceRootPath: null,
    });
    expect(status.sourceAvailable).toBe(false);
    expect(status.packSkills).toEqual([]);
  });
});

describe("DaemonSkillsService pack skill detail", () => {
  it("returns the document and files of a bundled skill", async () => {
    const service = new DaemonSkillsService(getDefaultSkillsSourceRoot());
    const [name] = PRODUCT_SKILL_NAMES;
    const detail = await service.show({ name });
    expect(detail.skill.name).toBe(name);
    expect(detail.skill.description).toBeTruthy();
    expect(detail.document?.content).toContain(`name: ${name}`);
    expect(detail.files.map((file) => file.path)).toContain("SKILL.md");
  });

  it("refuses names outside the pack", async () => {
    const service = new DaemonSkillsService(getDefaultSkillsSourceRoot());
    await expect(service.show({ name: "../product-skills" })).rejects.toThrow(
      "not a Cocurdex pack skill",
    );
    await expect(service.show({ name: "web-perf" })).rejects.toThrow(
      "not a Cocurdex pack skill",
    );
  });
});
