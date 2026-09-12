import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DaemonRequest } from "@cocurdex/rpc";
import type { WorkspaceRecord } from "@cocurdex/shared";
import { afterEach, describe, expect, it } from "vitest";
import { handleDaemonRequest } from "./handler";
import { CocurdexDaemonService } from "./service";
import { runGit } from "./workspace-changes/git-run";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {
        force: true,
        maxRetries: 5,
        recursive: true,
        retryDelay: 100,
      }),
    ),
  );
});

async function createService() {
  const userDataPath = await mkdtemp(
    path.join(tmpdir(), "cocurdex-worktree-mgmt-"),
  );
  temporaryDirectories.push(userDataPath);
  return {
    userDataPath,
    service: new CocurdexDaemonService({
      runtimeFingerprint: "test-runtime",
      userDataPath,
    }),
  };
}

async function createRepository(parent: string) {
  const repositoryPath = path.join(parent, "repository");
  await mkdir(repositoryPath);
  await runGit(["init"], { cwd: repositoryPath });
  await runGit(["config", "user.name", "Cocurdex Tests"], {
    cwd: repositoryPath,
  });
  await runGit(["config", "user.email", "tests@cocurdex.local"], {
    cwd: repositoryPath,
  });
  await writeFile(path.join(repositoryPath, "README.md"), "# Fixture\n");
  await runGit(["add", "README.md"], { cwd: repositoryPath });
  await runGit(["commit", "-m", "Initial commit"], { cwd: repositoryPath });
  return repositoryPath;
}

function workspaceFor(rootPath: string): WorkspaceRecord {
  const now = new Date().toISOString();
  return {
    id: "workspace-1",
    name: "fixture",
    rootPaths: [rootPath],
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    sortOrder: 1000,
  };
}

describe("worktree daemon RPC", () => {
  it("persists settings and reports the resolved root", async () => {
    const { service, userDataPath } = await createService();
    const defaultSettings = await handleDaemonRequest<"worktree.settings.get">(
      service,
      {
        id: "1",
        method: "worktree.settings.get",
        token: "test",
      } satisfies DaemonRequest<"worktree.settings.get">,
    );

    expect(defaultSettings.fetchBeforeCreate).toBe(false);
    expect(defaultSettings.rootPath).toBeNull();
    expect(defaultSettings.resolvedRootPath).toBe(
      path.join(userDataPath, "worktrees"),
    );

    const savedRoot = path.join(userDataPath, "custom-worktrees");
    const saved = await handleDaemonRequest<"worktree.settings.save">(service, {
      id: "2",
      method: "worktree.settings.save",
      params: { rootPath: savedRoot, fetchBeforeCreate: true },
      token: "test",
    } satisfies DaemonRequest<"worktree.settings.save">);

    expect(saved.fetchBeforeCreate).toBe(true);
    expect(saved.rootPath).toBe(savedRoot);
    expect(saved.resolvedRootPath).toBe(path.resolve(savedRoot));
  });

  it("creates, lists, and refuses to remove a bound worktree", async () => {
    const { service, userDataPath } = await createService();
    const repositoryPath = await createRepository(userDataPath);
    await service.saveWorkspace(workspaceFor(repositoryPath));

    const created = await handleDaemonRequest<"worktree.create">(service, {
      id: "1",
      method: "worktree.create",
      params: { workspaceId: "workspace-1", branch: "cocurdex/managed" },
      token: "test",
    } satisfies DaemonRequest<"worktree.create">);

    expect(created.branch).toBe("cocurdex/managed");

    const listed = await handleDaemonRequest<"worktree.list">(service, {
      id: "2",
      method: "worktree.list",
      token: "test",
    } satisfies DaemonRequest<"worktree.list">);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.path).toBe(created.path);
    expect(listed[0]?.sessions).toEqual([]);

    const now = new Date().toISOString();
    await service.createSession({
      workspaceRootPath: repositoryPath,
      session: {
        id: "session-1",
        workspaceId: "workspace-1",
        title: "Uses worktree",
        agentType: "pi",
        status: "idle",
        writeMode: "read-only",
        collaborationMode: "default",
        createdAt: now,
        updatedAt: now,
        lastMessageAt: null,
        worktreePath: created.path,
      },
    });

    await expect(
      handleDaemonRequest<"worktree.remove">(service, {
        id: "3",
        method: "worktree.remove",
        params: {
          workspaceId: "workspace-1",
          worktreePath: created.path,
        },
        token: "test",
      } satisfies DaemonRequest<"worktree.remove">),
    ).rejects.toThrow(/still uses this worktree/);

    await service.deleteSession("session-1");

    const listedAfterDelete = await handleDaemonRequest<"worktree.list">(
      service,
      {
        id: "4",
        method: "worktree.list",
        token: "test",
      } satisfies DaemonRequest<"worktree.list">,
    );
    expect(listedAfterDelete).toEqual([]);
  });

  it("removes an unused managed worktree", async () => {
    const { service, userDataPath } = await createService();
    const repositoryPath = await createRepository(userDataPath);
    await service.saveWorkspace(workspaceFor(repositoryPath));

    const created = await handleDaemonRequest<"worktree.create">(service, {
      id: "1",
      method: "worktree.create",
      params: { workspaceId: "workspace-1", branch: "cocurdex/unused" },
      token: "test",
    } satisfies DaemonRequest<"worktree.create">);

    const removed = await handleDaemonRequest<"worktree.remove">(service, {
      id: "2",
      method: "worktree.remove",
      params: {
        workspaceId: "workspace-1",
        worktreePath: created.path,
      },
      token: "test",
    } satisfies DaemonRequest<"worktree.remove">);

    expect(removed).toEqual({ removed: true });
    await expect(
      handleDaemonRequest<"worktree.list">(service, {
        id: "3",
        method: "worktree.list",
        token: "test",
      } satisfies DaemonRequest<"worktree.list">),
    ).resolves.toEqual([]);
  });
});
