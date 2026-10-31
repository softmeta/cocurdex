import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { PRODUCT_SKILL_NAMES } from "@cocurdex/product-skills/internal/manifest";
import {
  getProductSkillsStatus,
  installProductSkills,
  removeProductSkills,
} from "@cocurdex/product-skills/internal/sync-product-skills";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();

const sourceRoot = path.resolve(
  path.dirname(
    createRequire(import.meta.url).resolve("@cocurdex/product-skills"),
  ),
  "../skills",
);

async function makeTempRoot(): Promise<string> {
  const dir = await tempDirs.create("cocurdex-skills-");
  return dir;
}

afterEach(async () => {
  await tempDirs.cleanup();
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

  it("detects locally edited skills and restores them on install", async () => {
    const home = await makeTempRoot();
    const workspace = await makeTempRoot();
    const opts = {
      home,
      sourceRoot,
      packVersion: "0.1.0",
      preferClaudeCopy: true as const,
    };
    await installProductSkills("project", workspace, opts);
    const skillFile = path.join(
      workspace,
      ".agents",
      "skills",
      PRODUCT_SKILL_NAMES[0],
      "SKILL.md",
    );
    const original = await readFile(skillFile, "utf8");
    await writeFile(skillFile, "edited\n", "utf8");

    const edited = await getProductSkillsStatus("project", workspace, opts);
    expect(edited.modified).toBe(true);
    expect(edited.updateAvailable).toBe(false);

    const restored = await installProductSkills("project", workspace, opts);
    expect(restored.action).toBe("restored");
    expect(restored.modified).toBe(false);
    expect(await readFile(skillFile, "utf8")).toBe(original);
  });

  it("reports an untouched install as unmodified", async () => {
    const home = await makeTempRoot();
    const workspace = await makeTempRoot();
    const opts = {
      home,
      sourceRoot,
      packVersion: "0.1.0",
      preferClaudeCopy: true as const,
    };
    await installProductSkills("project", workspace, opts);
    const status = await getProductSkillsStatus("project", workspace, opts);
    expect(status.modified).toBe(false);
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

  it("removes managed skills retired from the pack on update", async () => {
    const home = await makeTempRoot();
    const workspace = await makeTempRoot();
    const agentsDir = path.join(workspace, ".agents", "skills");
    const claudeDir = path.join(workspace, ".claude", "skills");

    await installProductSkills("project", workspace, {
      home,
      sourceRoot,
      packVersion: "0.1.0",
      preferClaudeCopy: true,
    });
    for (const dir of [agentsDir, claudeDir]) {
      await mkdir(path.join(dir, "cocurdex-retired"), { recursive: true });
    }
    await writeFile(
      path.join(agentsDir, ".cocurdex-skills.json"),
      JSON.stringify({
        managedBy: "cocurdex",
        packVersion: "0.1.0",
        skills: [...PRODUCT_SKILL_NAMES, "cocurdex-retired"],
        scope: "project",
        installedAt: new Date().toISOString(),
      }),
      "utf8",
    );

    const updated = await installProductSkills("project", workspace, {
      home,
      sourceRoot,
      packVersion: "0.2.0",
      preferClaudeCopy: true,
    });

    expect(updated.skills).not.toContain("cocurdex-retired");
    for (const dir of [agentsDir, claudeDir]) {
      await expect(
        access(path.join(dir, "cocurdex-retired")),
      ).rejects.toThrow();
    }
  });

  it("reports conflict and does not overwrite unmanaged skills", async () => {
    const home = await makeTempRoot();
    const workspace = await makeTempRoot();
    const unmanaged = path.join(
      workspace,
      ".agents",
      "skills",
      "cocurdex-note",
    );
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
    expect(result.conflictSkills).toContain("cocurdex-note");
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
