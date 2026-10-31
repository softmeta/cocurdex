import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  readSkillLock,
  sourceInfoFromLock,
  withLockEntry,
  writeSkillLock,
} from "@cocurdex/daemon/internal/skills/skill-locks";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();
afterAll(() => tempDirs.cleanup());

describe("skill lock files", () => {
  it("round-trips the global lock in the skills CLI format", async () => {
    const lockPath = path.join(
      tempDirs.createSync("skill-lock-"),
      ".skill-lock.json",
    );
    await writeFile(
      lockPath,
      JSON.stringify(
        {
          version: 3,
          skills: {
            pdf: {
              source: "anthropics/skills",
              sourceType: "github",
              skillPath: "skills/pdf/SKILL.md",
              skillFolderHash: "abc",
              installedAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
              pluginName: "kept",
            },
          },
          dismissed: { findSkillsPrompt: true },
        },
        null,
        2,
      ),
    );
    const lock = await readSkillLock("global", lockPath);
    const next = withLockEntry(
      lock,
      "pdf",
      { ...lock.skills.pdf, skillFolderHash: "def" },
      "2026-02-01T00:00:00.000Z",
    );
    await writeSkillLock(next);
    const written = await readFile(lockPath, "utf8");

    expect(written.endsWith("\n")).toBe(false);
    expect(JSON.parse(written)).toEqual({
      version: 3,
      dismissed: { findSkillsPrompt: true },
      skills: {
        pdf: {
          source: "anthropics/skills",
          sourceType: "github",
          skillPath: "skills/pdf/SKILL.md",
          skillFolderHash: "def",
          installedAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-02-01T00:00:00.000Z",
          pluginName: "kept",
        },
      },
    });
    expect(sourceInfoFromLock(next.skills.pdf)).toMatchObject({
      kind: "github",
      skillPath: "skills/pdf",
    });
  });

  it("writes the project lock sorted with a trailing newline", async () => {
    const lockPath = path.join(
      tempDirs.createSync("skill-lock-"),
      "skills-lock.json",
    );
    let lock = await readSkillLock("project", lockPath);
    lock = withLockEntry(
      lock,
      "zeta",
      { source: "o/r", sourceType: "github", computedHash: "1" },
      "t",
    );
    lock = withLockEntry(
      lock,
      "alpha",
      { source: "o/r", sourceType: "github", computedHash: "2" },
      "t",
    );
    await writeSkillLock(lock);
    const written = await readFile(lockPath, "utf8");

    expect(written.endsWith("}\n")).toBe(true);
    expect(Object.keys(JSON.parse(written).skills)).toEqual(["alpha", "zeta"]);
    expect(JSON.parse(written).version).toBe(1);
  });

  it("ignores lock files written by an older format", async () => {
    const lockPath = path.join(
      tempDirs.createSync("skill-lock-"),
      ".skill-lock.json",
    );
    await writeFile(
      lockPath,
      JSON.stringify({ version: 2, skills: { a: {} } }),
    );
    expect((await readSkillLock("global", lockPath)).skills).toEqual({});
  });
});
