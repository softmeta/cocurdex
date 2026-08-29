import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { PRODUCT_SKILL_NAMES } from "./manifest";
import {
  getProductSkillsStatus,
  installProductSkills,
  removeProductSkills,
} from "./sync-product-skills";

const sourceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../skills",
);

const tempRoots: string[] = [];

async function makeTempRoot(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "cocurdex-skills-"));
  tempRoots.push(dir);
  return dir;
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    tempRoots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("product skills install", () => {
  it("installs project skills under .agents and .claude", async () => {
    const home = await makeTempRoot();
    const workspace = await makeTempRoot();

    const result = await installProductSkills("project", workspace, {
      home,
      sourceRoot,
      packVersion: "0.1.0",
      preferClaudeCopy: true,
    });

    expect(result.action).toBe("installed");
    expect(result.installed).toBe(true);
    expect(result.managed).toBe(true);
    expect(result.skills).toEqual([...PRODUCT_SKILL_NAMES].sort());
    expect(result.agentsSkillsDir).toBe(
      path.join(workspace, ".agents", "skills"),
    );
    expect(result.claudeSkillsDir).toBe(
      path.join(workspace, ".claude", "skills"),
    );
    expect(result.claudeLinkMode).toBe("copy");

    const status = await getProductSkillsStatus("project", workspace, {
      home,
      packVersion: "0.1.0",
    });
    expect(status.installed).toBe(true);
    expect(status.updateAvailable).toBe(false);
  });

  it("installs global skills under home", async () => {
    const home = await makeTempRoot();

    const result = await installProductSkills("global", undefined, {
      home,
      sourceRoot,
      packVersion: "0.1.0",
      preferClaudeCopy: true,
    });

    expect(result.action).toBe("installed");
    expect(result.agentsSkillsDir).toBe(path.join(home, ".agents", "skills"));
    expect(result.claudeSkillsDir).toBe(path.join(home, ".claude", "skills"));
  });

  it("skips when already at same pack version", async () => {
    const home = await makeTempRoot();
    const workspace = await makeTempRoot();
    const opts = {
      home,
      sourceRoot,
      packVersion: "0.1.0",
      preferClaudeCopy: true as const,
    };

    await installProductSkills("project", workspace, opts);
    const second = await installProductSkills("project", workspace, opts);
    expect(second.action).toBe("skipped");
  });

  it("updates when pack version changes", async () => {
    const home = await makeTempRoot();
    const workspace = await makeTempRoot();

    await installProductSkills("project", workspace, {
      home,
      sourceRoot,
      packVersion: "0.1.0",
      preferClaudeCopy: true,
    });

    const updated = await installProductSkills("project", workspace, {
      home,
      sourceRoot,
      packVersion: "0.2.0",
      preferClaudeCopy: true,
    });

    expect(updated.action).toBe("updated");
    expect(updated.installedVersion).toBe("0.2.0");
  });

  it("reports conflict and does not overwrite unmanaged skills", async () => {
    const home = await makeTempRoot();
    const workspace = await makeTempRoot();
    const unmanaged = path.join(workspace, ".agents", "skills", "cocurdex-prd");
    await mkdir(unmanaged, { recursive: true });
    await writeFile(path.join(unmanaged, "SKILL.md"), "# hand-made\n", "utf8");

    const result = await installProductSkills("project", workspace, {
      home,
      sourceRoot,
      packVersion: "0.1.0",
      preferClaudeCopy: true,
    });

    expect(result.action).toBe("conflict");
    expect(result.conflict).toBe(true);
    expect(result.conflictSkills).toContain("cocurdex-prd");
  });

  it("removes managed skills", async () => {
    const home = await makeTempRoot();
    const workspace = await makeTempRoot();
    const opts = {
      home,
      sourceRoot,
      packVersion: "0.1.0",
      preferClaudeCopy: true as const,
    };

    await installProductSkills("project", workspace, opts);
    const removed = await removeProductSkills("project", workspace, opts);
    expect(removed.removed).toBe(true);
    expect(removed.removedSkills.length).toBeGreaterThan(0);

    const status = await getProductSkillsStatus("project", workspace, opts);
    expect(status.installed).toBe(false);
    expect(status.managed).toBe(false);
  });
});
