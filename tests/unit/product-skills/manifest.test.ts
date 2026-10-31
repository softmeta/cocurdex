import { cp, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  getDefaultSkillsSourceRoot,
  getProductSkillsPackVersion,
} from "@cocurdex/product-skills/internal/manifest";
import {
  getProductSkillsStatus,
  installProductSkills,
} from "@cocurdex/product-skills/internal/sync-product-skills";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();

async function copySource(): Promise<string> {
  const dir = await tempDirs.create("cocurdex-skills-src-");
  await cp(getDefaultSkillsSourceRoot(), dir, { recursive: true });
  return dir;
}

afterEach(async () => {
  await tempDirs.cleanup();
});

describe("product skills pack version", () => {
  it("is stable for identical content", async () => {
    const copy = await copySource();

    expect(await getProductSkillsPackVersion(copy)).toBe(
      await getProductSkillsPackVersion(),
    );
  });

  it("changes when a skill file changes and flags managed installs for update", async () => {
    const source = await copySource();
    const home = await tempDirs.create("cocurdex-skills-home-");
    const installed = await installProductSkills("global", undefined, {
      home,
      sourceRoot: source,
      preferClaudeCopy: true,
    });

    await writeFile(
      path.join(source, "cocurdex-note", "SKILL.md"),
      "---\nname: cocurdex-note\n---\nchanged\n",
    );

    const status = await getProductSkillsStatus("global", undefined, {
      home,
      sourceRoot: source,
    });
    expect(status.packVersion).not.toBe(installed.packVersion);
    expect(status.updateAvailable).toBe(true);
  });
});
