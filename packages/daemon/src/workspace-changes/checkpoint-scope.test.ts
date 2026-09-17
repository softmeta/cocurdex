import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TurnChangeSet } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { createWorkspaceChangeCoordinator } from "./coordinator";
import { createGitCheckpointAdapter } from "./git-checkpoint";
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

async function createGitWorkspace() {
  const root = await mkdtemp(path.join(tmpdir(), "cocurdex-scope-ws-"));
  await runGit(["init"], { cwd: root });
  await runGit(["checkout", "-b", "main"], { cwd: root, allowFailure: true });
  await writeFile(path.join(root, "readme.md"), "hello\n", "utf8");
  await runGit(["add", "readme.md"], { cwd: root });
  await runGit(["commit", "-m", "init"], { cwd: root });
  return root;
}

async function createCoordinator() {
  const workspace = await createGitWorkspace();
  const userData = await mkdtemp(path.join(tmpdir(), "cocurdex-scope-data-"));
  const coordinator = createWorkspaceChangeCoordinator({
    userDataPath: userData,
    repository: createMemoryRepository(),
    createAdapter: async () => createGitCheckpointAdapter(),
  });
  return { workspace, coordinator };
}

async function listCheckpointRefs(workspace: string) {
  const output = await runGit(
    ["for-each-ref", "--format=%(refname)", "refs/cocurdex/checkpoints"],
    { cwd: workspace, allowFailure: true },
  );
  return output.split("\n").filter(Boolean);
}

describe("turn checkpoint scope", () => {
  it("keeps earlier turn checkpoints when a later turn changes nothing", async () => {
    const { workspace, coordinator } = await createCoordinator();
    const sessionId = "session-1";

    await coordinator.beginTurn({
      sessionId,
      userMessageId: "user-1",
      workspaceRootPath: workspace,
    });
    coordinator.markToolActivity(sessionId);
    await writeFile(path.join(workspace, "readme.md"), "hello world\n", "utf8");
    const first = await coordinator.finalizeTurn({
      sessionId,
      messageId: "assistant-1",
    });
    expect(first?.files.map((file) => file.path)).toEqual(["readme.md"]);

    await coordinator.beginTurn({
      sessionId,
      userMessageId: "user-2",
      workspaceRootPath: workspace,
    });
    coordinator.markToolActivity(sessionId);
    const second = await coordinator.finalizeTurn({
      sessionId,
      messageId: "assistant-2",
    });
    expect(second?.files).toEqual([]);

    const diff = await coordinator.getDiff({
      sessionId,
      messageId: "assistant-1",
      workspaceRootPath: workspace,
    });
    expect(diff.status).toBe("ok");
    expect(diff.files).toEqual([
      expect.objectContaining({
        path: "readme.md",
        omittedReason: null,
        oldContents: "hello\n",
        newContents: "hello world\n",
      }),
    ]);
  });

  it("keeps earlier turn checkpoints after a later turn is undone", async () => {
    const { workspace, coordinator } = await createCoordinator();
    const sessionId = "session-1";

    await coordinator.beginTurn({
      sessionId,
      userMessageId: "user-1",
      workspaceRootPath: workspace,
    });
    coordinator.markToolActivity(sessionId);
    await writeFile(path.join(workspace, "readme.md"), "first\n", "utf8");
    await coordinator.finalizeTurn({ sessionId, messageId: "assistant-1" });

    await coordinator.beginTurn({
      sessionId,
      userMessageId: "user-2",
      workspaceRootPath: workspace,
    });
    coordinator.markToolActivity(sessionId);
    await writeFile(path.join(workspace, "second.md"), "second\n", "utf8");
    await coordinator.finalizeTurn({ sessionId, messageId: "assistant-2" });

    const undone = await coordinator.undo({
      sessionId,
      messageId: "assistant-2",
      workspaceRootPath: workspace,
    });
    expect(undone.status).toBe("restored");

    const diff = await coordinator.getDiff({
      sessionId,
      messageId: "assistant-1",
      workspaceRootPath: workspace,
    });
    expect(diff.status).toBe("ok");
    expect(diff.files).toEqual([
      expect.objectContaining({ path: "readme.md", omittedReason: null }),
    ]);
    expect(await listCheckpointRefs(workspace)).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`/${sessionId}/turn/user-1/before`),
      ]),
    );
  });

  it("removes every checkpoint of the deleted session and no other", async () => {
    const { workspace, coordinator } = await createCoordinator();
    for (const sessionId of ["session-1", "session-2"]) {
      await coordinator.beginTurn({
        sessionId,
        userMessageId: `${sessionId}-user-1`,
        workspaceRootPath: workspace,
      });
      coordinator.markToolActivity(sessionId);
      await writeFile(
        path.join(workspace, `${sessionId}.md`),
        `${sessionId}\n`,
        "utf8",
      );
      await coordinator.finalizeTurn({
        sessionId,
        messageId: `${sessionId}-assistant-1`,
      });
    }
    expect(await listCheckpointRefs(workspace)).toHaveLength(4);

    await coordinator.deleteSessionCheckpoints("session-1", workspace);
    expect(await listCheckpointRefs(workspace)).toEqual([
      expect.stringContaining("/session-2/turn/session-2-user-1/after"),
      expect.stringContaining("/session-2/turn/session-2-user-1/before"),
    ]);
  });
});
