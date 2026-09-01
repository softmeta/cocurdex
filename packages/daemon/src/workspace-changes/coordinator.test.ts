import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TurnChangeSet } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { createCheckpointBlobStore } from "./blob-store";
import { createWorkspaceChangeCoordinator } from "./coordinator";
import { createFilesystemCheckpointAdapter } from "./filesystem-checkpoint";
import { runGit } from "./git-run";

function createMemoryRepository() {
  const rows = new Map<string, TurnChangeSet>();
  return {
    async listBySessionId(sessionId: string) {
      return Object.fromEntries(
        [...rows.values()]
          .filter((row) => row.sessionId === sessionId)
          .map((row) => [row.messageId || row.userMessageId, row]),
      );
    },
    async getByMessageId(sessionId: string, messageId: string) {
      return (
        [...rows.values()].find(
          (row) => row.sessionId === sessionId && row.messageId === messageId,
        ) ?? null
      );
    },
    async getByUserMessageId(sessionId: string, userMessageId: string) {
      return (
        [...rows.values()].find(
          (row) =>
            row.sessionId === sessionId && row.userMessageId === userMessageId,
        ) ?? null
      );
    },
    async getById(id: string) {
      return rows.get(id) ?? null;
    },
    async listAll() {
      return [...rows.values()];
    },
    async upsert(changeSet: TurnChangeSet) {
      rows.set(changeSet.id, changeSet);
    },
    async deleteById(id: string) {
      rows.delete(id);
    },
    async deleteBySessionId(sessionId: string) {
      for (const [id, row] of rows) {
        if (row.sessionId === sessionId) {
          rows.delete(id);
        }
      }
    },
  };
}

describe("workspace change coordinator", () => {
  it("does not reconcile a checkpoint before its change set is published", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "cocurdex-coord-ws-"));
    const userData = await mkdtemp(path.join(tmpdir(), "cocurdex-coord-data-"));
    await writeFile(path.join(workspace, "notes.md"), "before\n", "utf8");
    const innerRepository = createMemoryRepository();
    let releaseFirstUpsert: () => void = () => undefined;
    const firstUpsertBlocked = new Promise<void>((resolve) => {
      releaseFirstUpsert = resolve;
    });
    let notifyFirstUpsert: () => void = () => undefined;
    const firstUpsertStarted = new Promise<void>((resolve) => {
      notifyFirstUpsert = resolve;
    });
    let firstUpsert = true;
    const repository = {
      ...innerRepository,
      async upsert(changeSet: TurnChangeSet) {
        if (firstUpsert) {
          firstUpsert = false;
          notifyFirstUpsert();
          await firstUpsertBlocked;
        }
        await innerRepository.upsert(changeSet);
      },
    };
    const coordinator = createWorkspaceChangeCoordinator({
      userDataPath: userData,
      repository,
      createAdapter: async () =>
        createFilesystemCheckpointAdapter(
          createCheckpointBlobStore(userData),
          userData,
        ),
    });

    const begin = coordinator.beginTurn({
      sessionId: "session-1",
      userMessageId: "user-1",
      workspaceRootPath: workspace,
    });
    await firstUpsertStarted;
    const reconcile = coordinator.reconcile();
    await new Promise<void>((resolve) => setImmediate(resolve));
    releaseFirstUpsert();
    await Promise.all([begin, reconcile]);
    coordinator.markToolActivity("session-1");

    await writeFile(path.join(workspace, "notes.md"), "after\n", "utf8");
    const changeSet = await coordinator.finalizeTurn({
      sessionId: "session-1",
      messageId: "assistant-1",
    });
    expect(changeSet?.status).toBe("ready");
    expect(changeSet?.files).toEqual([
      expect.objectContaining({
        path: "notes.md",
        restorable: true,
        additions: 1,
        deletions: 1,
      }),
    ]);
    expect(changeSet?.additions).toBe(1);
    expect(changeSet?.deletions).toBe(1);
  });

  it("merges native evidence with host coverage and blocks conflicting undo", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "cocurdex-coord-ws-"));
    const userData = await mkdtemp(path.join(tmpdir(), "cocurdex-coord-data-"));
    await writeFile(path.join(workspace, "tracked.md"), "before\n", "utf8");
    const repository = createMemoryRepository();
    const coordinator = createWorkspaceChangeCoordinator({
      userDataPath: userData,
      repository,
      now: () => "2026-08-21T00:00:00.000Z",
      createId: () => "change-1",
      createAdapter: async () =>
        createFilesystemCheckpointAdapter(
          createCheckpointBlobStore(userData),
          userData,
        ),
    });

    await coordinator.beginTurn({
      sessionId: "session-1",
      userMessageId: "user-1",
      workspaceRootPath: workspace,
    });
    coordinator.markToolActivity("session-1");
    await coordinator.ingestNativeEvidence({
      sessionId: "session-1",
      userMessageId: "user-1",
      evidence: {
        source: "codex-turn-diff",
        coverage: "provider-file-tools",
        files: [
          {
            path: "tracked.md",
            operation: "modify",
            reviewKind: "text",
            additions: 1,
            deletions: 1,
            patch: "native-patch",
          },
        ],
      },
    });
    await writeFile(path.join(workspace, "tracked.md"), "after\n", "utf8");
    await writeFile(path.join(workspace, "bash.txt"), "from bash\n", "utf8");
    const changeSet = await coordinator.finalizeTurn({
      sessionId: "session-1",
      messageId: "assistant-1",
    });

    expect(changeSet?.status).toBe("ready");
    expect(changeSet?.coverage).toBe("workspace");
    expect(changeSet?.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "tracked.md",
          operation: "modify",
        }),
        expect.objectContaining({ path: "bash.txt", operation: "add" }),
      ]),
    );
    expect(
      changeSet?.files.find((file) => file.path === "tracked.md")?.patch,
    ).not.toBe("native-patch");

    await writeFile(
      path.join(workspace, "tracked.md"),
      "edited later\n",
      "utf8",
    );
    const undo = await coordinator.undo({
      sessionId: "session-1",
      messageId: "assistant-1",
      workspaceRootPath: workspace,
    });
    expect(undo.status).toBe("conflict");
    expect(undo.files.find((file) => file.path === "tracked.md")?.status).toBe(
      "conflict",
    );
  });

  it("fills Claude-style path-only native evidence with per-file line stats", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "cocurdex-coord-ws-"));
    const userData = await mkdtemp(path.join(tmpdir(), "cocurdex-coord-data-"));
    await writeFile(path.join(workspace, "AccountInfo.tsx"), "one\n", "utf8");
    await writeFile(
      path.join(workspace, "useHasFreePosition.ts"),
      "a\nb\n",
      "utf8",
    );
    const coordinator = createWorkspaceChangeCoordinator({
      userDataPath: userData,
      repository: createMemoryRepository(),
      now: () => "2026-08-21T00:00:00.000Z",
      createId: () => "change-claude",
      createAdapter: async () =>
        createFilesystemCheckpointAdapter(
          createCheckpointBlobStore(userData),
          userData,
        ),
    });

    await coordinator.beginTurn({
      sessionId: "session-claude",
      userMessageId: "user-1",
      workspaceRootPath: workspace,
    });
    coordinator.markToolActivity("session-claude");
    await coordinator.ingestNativeEvidence({
      sessionId: "session-claude",
      userMessageId: "user-1",
      evidence: {
        source: "claude-checkpoint",
        coverage: "provider-file-tools",
        files: [
          {
            path: "AccountInfo.tsx",
            operation: "modify",
            reviewKind: "text",
          },
          {
            path: "useHasFreePosition.ts",
            operation: "modify",
            reviewKind: "text",
          },
        ],
        additions: 3,
        deletions: 2,
      },
    });
    await writeFile(
      path.join(workspace, "AccountInfo.tsx"),
      "one\ntwo\n",
      "utf8",
    );
    await writeFile(
      path.join(workspace, "useHasFreePosition.ts"),
      "a\n",
      "utf8",
    );
    const changeSet = await coordinator.finalizeTurn({
      sessionId: "session-claude",
      messageId: "assistant-1",
    });

    expect(changeSet?.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "AccountInfo.tsx",
          additions: 1,
          deletions: 0,
        }),
        expect.objectContaining({
          path: "useHasFreePosition.ts",
          additions: 0,
          deletions: 1,
        }),
      ]),
    );
    expect(changeSet?.additions).toBe(1);
    expect(changeSet?.deletions).toBe(1);
  });

  it("captures a recovery checkpoint and restores matching files", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "cocurdex-coord-ws-"));
    const userData = await mkdtemp(path.join(tmpdir(), "cocurdex-coord-data-"));
    await mkdir(path.join(workspace, "notes"), { recursive: true });
    await writeFile(path.join(workspace, "notes/a.md"), "one\n", "utf8");
    const repository = createMemoryRepository();
    const coordinator = createWorkspaceChangeCoordinator({
      userDataPath: userData,
      repository,
      createId: () => crypto.randomUUID(),
      createAdapter: async () =>
        createFilesystemCheckpointAdapter(
          createCheckpointBlobStore(userData),
          userData,
        ),
    });

    await coordinator.beginTurn({
      sessionId: "session-1",
      userMessageId: "user-1",
      workspaceRootPath: workspace,
    });
    coordinator.markToolActivity("session-1");
    await writeFile(path.join(workspace, "notes/a.md"), "two\n", "utf8");
    await coordinator.finalizeTurn({
      sessionId: "session-1",
      messageId: "assistant-1",
    });

    const undo = await coordinator.undo({
      sessionId: "session-1",
      messageId: "assistant-1",
      workspaceRootPath: workspace,
    });
    expect(undo.status).toBe("restored");
    // A successful undo drops its recovery snapshot right away.
    expect(undo.recoveryCheckpointRef).toBeNull();
    expect(await readFile(path.join(workspace, "notes/a.md"), "utf8")).toBe(
      "one\n",
    );
  });

  it("finalizes interrupted turns so written files can be reviewed and undone", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "cocurdex-coord-ws-"));
    const userData = await mkdtemp(path.join(tmpdir(), "cocurdex-coord-data-"));
    await writeFile(path.join(workspace, "notes.md"), "before\n", "utf8");
    const coordinator = createWorkspaceChangeCoordinator({
      userDataPath: userData,
      repository: createMemoryRepository(),
      createAdapter: async () =>
        createFilesystemCheckpointAdapter(
          createCheckpointBlobStore(userData),
          userData,
        ),
    });

    await coordinator.beginTurn({
      sessionId: "session-1",
      userMessageId: "user-1",
      workspaceRootPath: workspace,
    });
    coordinator.markToolActivity("session-1");
    await writeFile(path.join(workspace, "notes.md"), "interrupted\n", "utf8");
    const changeSet = await coordinator.failTurn("session-1", "interrupted");

    expect(changeSet?.outcome).toBe("interrupted");
    expect(changeSet?.status).toBe("ready");
    expect(changeSet?.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "notes.md", operation: "modify" }),
      ]),
    );

    const undo = await coordinator.undo({
      sessionId: "session-1",
      messageId: changeSet?.messageId || "user-1",
      workspaceRootPath: workspace,
    });
    expect(undo.status).toBe("restored");
    expect(await readFile(path.join(workspace, "notes.md"), "utf8")).toBe(
      "before\n",
    );
  });

  it("does not finalize the same turn twice when stop and completed race", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "cocurdex-coord-ws-"));
    const userData = await mkdtemp(path.join(tmpdir(), "cocurdex-coord-data-"));
    await writeFile(path.join(workspace, "notes.md"), "before\n", "utf8");
    const coordinator = createWorkspaceChangeCoordinator({
      userDataPath: userData,
      repository: createMemoryRepository(),
      createAdapter: async () =>
        createFilesystemCheckpointAdapter(
          createCheckpointBlobStore(userData),
          userData,
        ),
    });

    await coordinator.beginTurn({
      sessionId: "session-1",
      userMessageId: "user-1",
      workspaceRootPath: workspace,
    });
    coordinator.markToolActivity("session-1");
    await writeFile(path.join(workspace, "notes.md"), "after\n", "utf8");
    const [interrupted, completed] = await Promise.all([
      coordinator.failTurn("session-1", "interrupted"),
      coordinator.finalizeTurn({
        sessionId: "session-1",
        messageId: "assistant-1",
      }),
    ]);

    expect(interrupted?.id).toBe(completed?.id);
    expect(interrupted?.files).toEqual(completed?.files);
    expect(["interrupted", "completed"]).toContain(interrupted?.outcome);
  });

  it("recovers the post-turn workspace when a multi-file restore fails mid-way", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "cocurdex-coord-ws-"));
    const userData = await mkdtemp(path.join(tmpdir(), "cocurdex-coord-data-"));
    await writeFile(path.join(workspace, "a.md"), "a0\n", "utf8");
    await writeFile(path.join(workspace, "b.md"), "b0\n", "utf8");
    await writeFile(path.join(workspace, "c.md"), "c0\n", "utf8");
    const inner = createFilesystemCheckpointAdapter(
      createCheckpointBlobStore(userData),
      userData,
    );
    let restoreCalls = 0;
    const adapter = {
      ...inner,
      async restorePaths(input: Parameters<typeof inner.restorePaths>[0]) {
        const results = [];
        for (const plan of input.paths) {
          restoreCalls += 1;
          if (restoreCalls === 2) {
            results.push({
              path: plan.path,
              status: "failed" as const,
              reason: "injected failure",
            });
            continue;
          }
          const restored = await inner.restorePaths({
            ...input,
            paths: [plan],
          });
          results.push(...restored);
        }
        return results;
      },
    };
    const coordinator = createWorkspaceChangeCoordinator({
      userDataPath: userData,
      repository: createMemoryRepository(),
      createAdapter: async () => adapter,
    });

    await coordinator.beginTurn({
      sessionId: "session-1",
      userMessageId: "user-1",
      workspaceRootPath: workspace,
    });
    coordinator.markToolActivity("session-1");
    await writeFile(path.join(workspace, "a.md"), "a1\n", "utf8");
    await writeFile(path.join(workspace, "b.md"), "b1\n", "utf8");
    await writeFile(path.join(workspace, "c.md"), "c1\n", "utf8");
    await coordinator.finalizeTurn({
      sessionId: "session-1",
      messageId: "assistant-1",
    });

    const undo = await coordinator.undo({
      sessionId: "session-1",
      messageId: "assistant-1",
      workspaceRootPath: workspace,
    });
    expect(undo.status).toBe("failed");
    expect(undo.recoveryStatus).toBe("succeeded");
    expect(undo.files.some((file) => file.status === "failed")).toBe(true);
    expect(await readFile(path.join(workspace, "a.md"), "utf8")).toBe("a1\n");
    expect(await readFile(path.join(workspace, "b.md"), "utf8")).toBe("b1\n");
    expect(await readFile(path.join(workspace, "c.md"), "utf8")).toBe("c1\n");
  });

  it("recovers when a host adapter throws after mutating a file", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "cocurdex-coord-ws-"));
    const userData = await mkdtemp(path.join(tmpdir(), "cocurdex-coord-data-"));
    await writeFile(path.join(workspace, "a.md"), "a0\n", "utf8");
    await writeFile(path.join(workspace, "b.md"), "b0\n", "utf8");
    const inner = createFilesystemCheckpointAdapter(
      createCheckpointBlobStore(userData),
      userData,
    );
    let restoreCalls = 0;
    const adapter = {
      ...inner,
      async restorePaths(input: Parameters<typeof inner.restorePaths>[0]) {
        restoreCalls += 1;
        if (restoreCalls === 1) {
          await inner.restorePaths({
            ...input,
            paths: input.paths.slice(0, 1),
          });
          throw new Error("adapter crashed");
        }
        return inner.restorePaths(input);
      },
    };
    const coordinator = createWorkspaceChangeCoordinator({
      userDataPath: userData,
      repository: createMemoryRepository(),
      createAdapter: async () => adapter,
    });
    await coordinator.beginTurn({
      sessionId: "session-1",
      userMessageId: "user-1",
      workspaceRootPath: workspace,
    });
    coordinator.markToolActivity("session-1");
    await writeFile(path.join(workspace, "a.md"), "a1\n", "utf8");
    await writeFile(path.join(workspace, "b.md"), "b1\n", "utf8");
    await coordinator.finalizeTurn({
      sessionId: "session-1",
      messageId: "assistant-1",
    });
    const undo = await coordinator.undo({
      sessionId: "session-1",
      messageId: "assistant-1",
      workspaceRootPath: workspace,
    });
    expect(undo.status).toBe("failed");
    expect(["succeeded", "failed"]).toContain(undo.recoveryStatus);
    expect(await readFile(path.join(workspace, "a.md"), "utf8")).toBe("a1\n");
    expect(await readFile(path.join(workspace, "b.md"), "utf8")).toBe("b1\n");
  });

  it("keeps using the recorded filesystem checkpoint after git init", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "cocurdex-coord-ws-"));
    const userData = await mkdtemp(path.join(tmpdir(), "cocurdex-coord-data-"));
    await writeFile(path.join(workspace, "notes.md"), "before\n", "utf8");
    const filesystem = createFilesystemCheckpointAdapter(
      createCheckpointBlobStore(userData),
      userData,
    );
    let preferGit = false;
    const coordinator = createWorkspaceChangeCoordinator({
      userDataPath: userData,
      repository: createMemoryRepository(),
      createAdapter: async () => {
        if (!preferGit) {
          return filesystem;
        }
        const { createGitCheckpointAdapter } = await import("./git-checkpoint");
        return createGitCheckpointAdapter();
      },
    });

    await coordinator.beginTurn({
      sessionId: "session-1",
      userMessageId: "user-1",
      workspaceRootPath: workspace,
    });
    coordinator.markToolActivity("session-1");
    await writeFile(path.join(workspace, "notes.md"), "after\n", "utf8");
    const changeSet = await coordinator.finalizeTurn({
      sessionId: "session-1",
      messageId: "assistant-1",
    });
    expect(changeSet?.hostBeforeCheckpointKind).toBe("filesystem-checkpoint");
    preferGit = true;

    const undo = await coordinator.undo({
      sessionId: "session-1",
      messageId: "assistant-1",
      workspaceRootPath: workspace,
    });
    expect(undo.status).toBe("restored");
    expect(await readFile(path.join(workspace, "notes.md"), "utf8")).toBe(
      "before\n",
    );
  });

  it("removes session manifests and unreferenced blobs, keeping shared blobs", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "cocurdex-coord-ws-"));
    const userData = await mkdtemp(path.join(tmpdir(), "cocurdex-coord-data-"));
    await writeFile(path.join(workspace, "shared.md"), "same\n", "utf8");
    const repository = createMemoryRepository();
    const coordinator = createWorkspaceChangeCoordinator({
      userDataPath: userData,
      repository,
      createAdapter: async () =>
        createFilesystemCheckpointAdapter(
          createCheckpointBlobStore(userData),
          userData,
        ),
    });

    await coordinator.beginTurn({
      sessionId: "session-1",
      userMessageId: "user-1",
      workspaceRootPath: workspace,
    });
    coordinator.markToolActivity("session-1");
    await writeFile(path.join(workspace, "shared.md"), "one\n", "utf8");
    await coordinator.finalizeTurn({
      sessionId: "session-1",
      messageId: "assistant-1",
    });

    await writeFile(path.join(workspace, "shared.md"), "same\n", "utf8");
    await coordinator.beginTurn({
      sessionId: "session-2",
      userMessageId: "user-2",
      workspaceRootPath: workspace,
    });
    coordinator.markToolActivity("session-2");
    await writeFile(path.join(workspace, "shared.md"), "two\n", "utf8");
    await coordinator.finalizeTurn({
      sessionId: "session-2",
      messageId: "assistant-2",
    });

    await coordinator.deleteSessionCheckpoints("session-1", workspace);
    await repository.deleteBySessionId("session-1");
    await coordinator.reconcile();
    await coordinator.reconcile();

    const undo = await coordinator.undo({
      sessionId: "session-2",
      messageId: "assistant-2",
      workspaceRootPath: workspace,
    });
    expect(undo.status).toBe("restored");
    expect(await readFile(path.join(workspace, "shared.md"), "utf8")).toBe(
      "same\n",
    );
  });

  it("does not interpret a git checkpoint as a filesystem manifest after .git is removed", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "cocurdex-coord-git-"));
    const userData = await mkdtemp(path.join(tmpdir(), "cocurdex-coord-data-"));
    await runGit(["init"], { cwd: workspace });
    await runGit(["checkout", "-b", "main"], {
      cwd: workspace,
      allowFailure: true,
    });
    await writeFile(path.join(workspace, "readme.md"), "hello\n", "utf8");
    await runGit(["add", "readme.md"], { cwd: workspace });
    await runGit(["commit", "-m", "init"], { cwd: workspace });
    const coordinator = createWorkspaceChangeCoordinator({
      userDataPath: userData,
      repository: createMemoryRepository(),
    });

    await coordinator.beginTurn({
      sessionId: "session-1",
      userMessageId: "user-1",
      workspaceRootPath: workspace,
    });
    coordinator.markToolActivity("session-1");
    await writeFile(path.join(workspace, "readme.md"), "changed\n", "utf8");
    const changeSet = await coordinator.finalizeTurn({
      sessionId: "session-1",
      messageId: "assistant-1",
    });
    expect(changeSet?.hostBeforeCheckpointKind).toBe("git-checkpoint");

    await rm(path.join(workspace, ".git"), { recursive: true, force: true });
    const undo = await coordinator.undo({
      sessionId: "session-1",
      messageId: "assistant-1",
      workspaceRootPath: workspace,
    });
    expect(["failed", "conflict"]).toContain(undo.status);
    expect(undo.files.every((file) => file.status !== "restored")).toBe(true);
    expect(await readFile(path.join(workspace, "readme.md"), "utf8")).toBe(
      "changed\n",
    );
  });

  it("keeps no row or checkpoint for a turn that ran no tool", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "cocurdex-coord-ws-"));
    const userData = await mkdtemp(path.join(tmpdir(), "cocurdex-coord-data-"));
    await writeFile(path.join(workspace, "notes.md"), "before\n", "utf8");
    const repository = createMemoryRepository();
    const coordinator = createWorkspaceChangeCoordinator({
      userDataPath: userData,
      repository,
      createAdapter: async () =>
        createFilesystemCheckpointAdapter(
          createCheckpointBlobStore(userData),
          userData,
        ),
    });

    await coordinator.beginTurn({
      sessionId: "session-1",
      userMessageId: "user-1",
      workspaceRootPath: workspace,
    });
    const changeSet = await coordinator.finalizeTurn({
      sessionId: "session-1",
      messageId: "assistant-1",
    });

    expect(changeSet?.files).toEqual([]);
    expect(await repository.listAll()).toEqual([]);
  });

  it("keeps no row for a tool turn that changed nothing", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "cocurdex-coord-ws-"));
    const userData = await mkdtemp(path.join(tmpdir(), "cocurdex-coord-data-"));
    await writeFile(path.join(workspace, "notes.md"), "before\n", "utf8");
    const repository = createMemoryRepository();
    const coordinator = createWorkspaceChangeCoordinator({
      userDataPath: userData,
      repository,
      createAdapter: async () =>
        createFilesystemCheckpointAdapter(
          createCheckpointBlobStore(userData),
          userData,
        ),
    });

    await coordinator.beginTurn({
      sessionId: "session-1",
      userMessageId: "user-1",
      workspaceRootPath: workspace,
    });
    coordinator.markToolActivity("session-1");
    const changeSet = await coordinator.finalizeTurn({
      sessionId: "session-1",
      messageId: "assistant-1",
    });

    expect(changeSet?.files).toEqual([]);
    expect(await repository.listAll()).toEqual([]);
  });
});
