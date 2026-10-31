import { existsSync, lstatSync, mkdirSync, writeFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { DaemonSkillLibraryService } from "@cocurdex/daemon/internal/skills/index";
import { GithubSnapshotStore } from "@cocurdex/daemon/internal/skills/skill-snapshots";
import type { WorkspaceRecord } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type ArchiveServer,
  SkillTestRepo,
  serveRepoArchives,
  skillMarkdown,
} from "./skill-test-repo";

const tempDirs = createTempDirs();
const now = "2026-10-20T00:00:00.000Z";
let server: ArchiveServer;
let repo: SkillTestRepo;

beforeAll(async () => {
  repo = new SkillTestRepo(tempDirs.createSync("skill-repo-"));
  repo.write(
    "skills/review/SKILL.md",
    skillMarkdown("review", "Review changes"),
  );
  repo.write("skills/review/scripts/check.sh", "#!/bin/sh\necho v1\n");
  repo.write("skills/notes/SKILL.md", skillMarkdown("notes", "Take notes"));
  repo.write("skills/broken/SKILL.md", "# no frontmatter\n");
  repo.commit("initial skills");
  server = await serveRepoArchives({ "acme/skills": repo });
});

afterAll(async () => {
  await server.close();
  await tempDirs.cleanup();
});

function memorySettings() {
  const values = new Map<string, string>();
  return {
    get: async (key: string) => values.get(key) ?? null,
    set: async (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

function setup() {
  const home = tempDirs.createSync("skill-home-");
  const userDataPath = tempDirs.createSync("skill-data-");
  const workspaceRoot = tempDirs.createSync("skill-ws-");
  const workspace: WorkspaceRecord = {
    id: "workspace-1",
    name: "acme-shop",
    rootPaths: [workspaceRoot],
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    sortOrder: 1000,
  };
  const service = new DaemonSkillLibraryService({
    userDataPath,
    home,
    env: {},
    settings: memorySettings(),
    listWorkspaces: async () => [workspace],
    snapshots: new GithubSnapshotStore(path.join(userDataPath, "skill-cache"), {
      archiveBase: server.url,
      freshForMs: 0,
    }),
  });
  return { service, home, userDataPath, workspaceRoot };
}

describe("skill library", () => {
  it("installs GitHub skills into the shared folder and records them in the global lock", async () => {
    const { service, home } = setup();

    const snapshot = await service.inspectSource("acme/skills");
    expect(snapshot.commit).toBe(repo.head());
    expect(snapshot.skills.map((skill) => skill.skillPath)).toEqual([
      "skills/broken",
      "skills/notes",
      "skills/review",
    ]);

    const result = await service.add({
      scope: "global",
      source: "acme/skills",
      skillPaths: ["skills/review", "skills/broken"],
      agents: ["claude-code"],
      replace: [],
    });
    expect(result).toEqual({
      installed: ["review"],
      skipped: [{ name: "broken", reason: "invalid" }],
    });

    const shared = path.join(home, ".agents", "skills", "review");
    expect(
      await readFile(path.join(shared, "scripts", "check.sh"), "utf8"),
    ).toContain("v1");
    expect(
      lstatSync(
        path.join(home, ".claude", "skills", "review"),
      ).isSymbolicLink(),
    ).toBe(true);

    const lock = JSON.parse(
      await readFile(path.join(home, ".agents", ".skill-lock.json"), "utf8"),
    );
    expect(lock.skills.review).toMatchObject({
      source: "acme/skills",
      sourceType: "github",
      skillPath: "skills/review/SKILL.md",
      skillFolderHash: repo.treeSha("skills/review"),
    });

    const { skills } = await service.list();
    const review = skills.find((skill) => skill.name === "review");
    expect(review?.agents).toEqual([
      { agent: "shared", access: "native", path: shared, toggleable: false },
      {
        agent: "claude-code",
        access: "link",
        path: path.join(home, ".claude", "skills", "review"),
        toggleable: true,
      },
      { agent: "antigravity", access: "none", path: null, toggleable: true },
    ]);
    expect(review?.source).toMatchObject({
      kind: "github",
      skillPath: "skills/review",
    });
  });

  it("skips existing skills unless they are replaced, keeping a backup", async () => {
    const { service, home, userDataPath } = setup();
    const existing = path.join(home, ".agents", "skills", "notes");
    mkdirSync(existing, { recursive: true });
    writeFileSync(
      path.join(existing, "SKILL.md"),
      skillMarkdown("notes", "Mine"),
    );
    const request = {
      scope: "global" as const,
      source: "acme/skills",
      skillPaths: ["skills/notes"],
      agents: [],
      replace: [] as string[],
    };

    expect(await service.add(request)).toEqual({
      installed: [],
      skipped: [{ name: "notes", reason: "exists" }],
    });
    expect(await service.add({ ...request, replace: ["notes"] })).toMatchObject(
      {
        installed: ["notes"],
      },
    );
    expect(await readFile(path.join(existing, "SKILL.md"), "utf8")).toContain(
      "Take notes",
    );
    const backups = await readdir(path.join(userDataPath, "skill-backups"));
    expect(backups).toHaveLength(1);
    expect(
      await readFile(
        path.join(
          userDataPath,
          "skill-backups",
          backups[0] as string,
          "SKILL.md",
        ),
        "utf8",
      ),
    ).toContain("Mine");
  });

  it("finds updates, previews the diff, honors skip, and applies them", async () => {
    const { service, home } = setup();
    await service.add({
      scope: "global",
      source: "acme/skills",
      skillPaths: ["skills/review"],
      agents: [],
      replace: [],
    });
    const ref = { scope: "global" as const, workspaceId: null, name: "review" };

    expect((await service.checkUpdates()).updates).toEqual([]);

    repo.write("skills/review/scripts/check.sh", "#!/bin/sh\necho v2\n");
    repo.write("skills/review/references/guide.md", "# Guide\n");
    const latest = repo.commit("update review");

    const check = await service.checkUpdates();
    expect(check.failures).toEqual([]);
    expect(check.updates).toEqual([
      expect.objectContaining({
        name: "review",
        latestCommit: latest,
        skipped: false,
      }),
    ]);

    const preview = await service.previewUpdate(ref);
    expect(preview.localModified).toBe(false);
    expect(
      preview.changes.map(({ path: file, status, additions, deletions }) => ({
        file,
        status,
        additions,
        deletions,
      })),
    ).toEqual([
      {
        file: "references/guide.md",
        status: "added",
        additions: 1,
        deletions: 0,
      },
      {
        file: "scripts/check.sh",
        status: "modified",
        additions: 1,
        deletions: 1,
      },
    ]);
    expect(preview.changes[1]?.patch).toContain("+echo v2");

    await service.skipUpdate(ref, latest);
    const skipped = (await service.list()).skills.find(
      (skill) => skill.name === "review",
    );
    expect(skipped?.update).toMatchObject({
      latestCommit: latest,
      skipped: true,
    });

    expect(await service.applyUpdates([ref])).toEqual({ updated: ["review"] });
    const shared = path.join(home, ".agents", "skills", "review");
    expect(
      await readFile(path.join(shared, "scripts", "check.sh"), "utf8"),
    ).toContain("v2");
    const lock = JSON.parse(
      await readFile(path.join(home, ".agents", ".skill-lock.json"), "utf8"),
    );
    expect(lock.skills.review.skillFolderHash).toBe(
      repo.treeSha("skills/review"),
    );
    const after = (await service.list()).skills.find(
      (skill) => skill.name === "review",
    );
    expect(after?.update).toBeNull();
    expect((await service.checkUpdates()).updates).toEqual([]);
  });

  it("reports local edits before an update overwrites them", async () => {
    const { service, home } = setup();
    await service.add({
      scope: "global",
      source: "acme/skills",
      skillPaths: ["skills/notes"],
      agents: [],
      replace: [],
    });
    writeFileSync(
      path.join(home, ".agents", "skills", "notes", "local.md"),
      "mine\n",
    );

    const preview = await service.previewUpdate({
      scope: "global",
      name: "notes",
    });
    expect(preview.localModified).toBe(
      process.platform === "win32" ? null : true,
    );
    expect(preview.changes).toEqual([
      expect.objectContaining({ path: "local.md", status: "removed" }),
    ]);
  });

  it("installs a local folder into a workspace with the project lock", async () => {
    const { service, workspaceRoot } = setup();
    const source = tempDirs.createSync("skill-local-");
    mkdirSync(path.join(source, "deploy"));
    writeFileSync(
      path.join(source, "deploy", "SKILL.md"),
      skillMarkdown("deploy", "Ship it"),
    );

    const result = await service.add({
      scope: "workspace",
      workspaceId: "workspace-1",
      source,
      skillPaths: ["deploy"],
      agents: ["claude-code", "antigravity"],
      replace: [],
    });
    expect(result.installed).toEqual(["deploy"]);
    expect(
      existsSync(
        path.join(workspaceRoot, ".agents", "skills", "deploy", "SKILL.md"),
      ),
    ).toBe(true);
    expect(
      lstatSync(
        path.join(workspaceRoot, ".claude", "skills", "deploy"),
      ).isSymbolicLink(),
    ).toBe(true);

    const lockText = await readFile(
      path.join(workspaceRoot, "skills-lock.json"),
      "utf8",
    );
    expect(lockText.endsWith("\n")).toBe(true);
    expect(JSON.parse(lockText)).toMatchObject({
      version: 1,
      skills: {
        deploy: {
          source,
          sourceType: "local",
          computedHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        },
      },
    });
    const listed = await service.list("workspace-1");
    expect(listed.workspace?.rootPath).toBe(workspaceRoot);
    expect(
      listed.skills.find((skill) => skill.name === "deploy"),
    ).toMatchObject({
      scope: "workspace",
      workspaceId: "workspace-1",
      source: { kind: "local" },
    });
  });

  it("removes a skill with its links and lock entry", async () => {
    const { service, home } = setup();
    await service.add({
      scope: "global",
      source: "acme/skills",
      skillPaths: ["skills/notes"],
      agents: ["claude-code"],
      replace: [],
    });

    await service.remove({ scope: "global", name: "notes" });
    expect(existsSync(path.join(home, ".agents", "skills", "notes"))).toBe(
      false,
    );
    expect(existsSync(path.join(home, ".claude", "skills", "notes"))).toBe(
      false,
    );
    const lock = JSON.parse(
      await readFile(path.join(home, ".agents", ".skill-lock.json"), "utf8"),
    );
    expect(lock.skills.notes).toBeUndefined();
  });
});
