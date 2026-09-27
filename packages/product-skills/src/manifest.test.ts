import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getDefaultSkillsSourceRoot,
  getProductSkillsPackVersion,
} from "./manifest";
import {
  getProductSkillsStatus,
  installProductSkills,
} from "./sync-product-skills";

const tempRoots: string[] = [];

async function copySource(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "cocurdex-skills-src-"));
  tempRoots.push(dir);
  await cp(getDefaultSkillsSourceRoot(), dir, { recursive: true });
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
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
    const home = await mkdtemp(path.join(tmpdir(), "cocurdex-skills-home-"));
    tempRoots.push(home);
    const installed = await installProductSkills("global", undefined, {
      home,
      sourceRoot: source,
      preferClaudeCopy: true,
    });

    await writeFile(
      path.join(source, "cocurdex-ask", "SKILL.md"),
      "---\nname: cocurdex-ask\n---\nchanged\n",
    );

    const status = await getProductSkillsStatus("global", undefined, {
      home,
      sourceRoot: source,
    });
    expect(status.packVersion).not.toBe(installed.packVersion);
    expect(status.updateAvailable).toBe(true);
  });
});
