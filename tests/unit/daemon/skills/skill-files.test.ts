import { chmodSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  computeGitTreeSha,
  gitBlobSha,
  isExecutableMode,
  listSkillFiles,
} from "@cocurdex/daemon/internal/skills/skill-files";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";
import { SkillTestRepo, skillMarkdown } from "./skill-test-repo";

const tempDirs = createTempDirs();
afterAll(() => tempDirs.cleanup());

async function treeShaOnDisk(dir: string) {
  const files = await listSkillFiles(dir);
  return computeGitTreeSha(
    await Promise.all(
      files.map(async (file) => ({
        path: file.path,
        mode: isExecutableMode(file.mode)
          ? ("100755" as const)
          : ("100644" as const),
        sha: gitBlobSha(
          await readFile(path.join(dir, ...file.path.split("/"))),
        ),
      })),
    ),
  );
}

describe("computeGitTreeSha", () => {
  it("matches the tree id git records for a skill folder", async () => {
    const repo = new SkillTestRepo(tempDirs.createSync("skill-tree-"));
    repo.write(
      "skills/review/SKILL.md",
      skillMarkdown("review", "Review code"),
    );
    repo.write("skills/review/references/guide.md", "# Guide\n");
    repo.write("skills/review/references/a-b.md", "dash sorts before slash\n");
    repo.write("skills/review/references.txt", "file next to a folder\n");
    repo.write("skills/review/scripts/run.sh", "#!/bin/sh\necho ok\n");
    if (process.platform !== "win32") {
      chmodSync(path.join(repo.dir, "skills/review/scripts/run.sh"), 0o755);
    }
    repo.commit("add review skill");

    expect(await treeShaOnDisk(path.join(repo.dir, "skills", "review"))).toBe(
      repo.treeSha("skills/review"),
    );
  });
});
