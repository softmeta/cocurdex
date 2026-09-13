import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { SessionCheckpointStore } from "./checkpoints";

const execute = promisify(execFile);
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "cocurdex-checkpoint-"));
  const data = await mkdtemp(path.join(tmpdir(), "cocurdex-checkpoint-data-"));
  directories.push(root, data);
  const git = async (...args: string[]) =>
    (
      await execute("git", args, {
        cwd: root,
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: "Test",
          GIT_AUTHOR_EMAIL: "test@example.com",
          GIT_COMMITTER_NAME: "Test",
          GIT_COMMITTER_EMAIL: "test@example.com",
        },
      })
    ).stdout;
  await git("init");
  await writeFile(path.join(root, "tracked.txt"), "base");
  await git("add", ".");
  await git("-c", "commit.gpgsign=false", "commit", "-m", "Initial");
  const store = new SessionCheckpointStore(data);
  const input = {
    sessionId: "session-1",
    messageId: "message-1",
    workspaceRootPath: root,
  };
  return { root, data, git, store, input };
}

describe("session checkpoints", () => {
  it("restores worktree contents, empty files, deletions, and the staged index", async () => {
    const { root, git, store, input } = await fixture();
    await writeFile(path.join(root, "tracked.txt"), "staged");
    await git("add", "tracked.txt");
    await writeFile(path.join(root, "tracked.txt"), "unstaged");
    await writeFile(path.join(root, "empty.txt"), "");
    await store.capture(input);
    await writeFile(path.join(root, "tracked.txt"), "agent output");
    await writeFile(path.join(root, "empty.txt"), "filled");
    await writeFile(path.join(root, "new.txt"), "new output");
    await git("add", ".");

    await store.restore(input);

    expect(await readFile(path.join(root, "tracked.txt"), "utf8")).toBe(
      "unstaged",
    );
    expect(await readFile(path.join(root, "empty.txt"), "utf8")).toBe("");
    expect(await git("show", ":tracked.txt")).toBe("staged");
    await expect(readFile(path.join(root, "new.txt"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("refuses restoration after HEAD or the workspace changes", async () => {
    const first = await fixture();
    const second = await fixture();
    await first.store.capture(first.input);
    await expect(
      first.store.restore({ ...first.input, workspaceRootPath: second.root }),
    ).rejects.toThrow("current session workspace");
    await writeFile(path.join(first.root, "tracked.txt"), "committed");
    await first.git("add", ".");
    await first.git("-c", "commit.gpgsign=false", "commit", "-m", "Changed");
    await expect(first.store.restore(first.input)).rejects.toThrow(
      "HEAD changed",
    );
    expect(await first.store.status(first.input)).toEqual({ available: false });
    expect(await readFile(path.join(first.root, "tracked.txt"), "utf8")).toBe(
      "committed",
    );
  });

  it("does not retain a stale checkpoint when a replacement cannot capture all files", async () => {
    const { root, store, input } = await fixture();
    await store.capture(input);
    await writeFile(
      path.join(root, "large.bin"),
      Buffer.alloc(1024 * 1024 + 1),
    );
    await expect(store.capture(input)).rejects.toThrow(
      "cannot be checkpointed",
    );
    expect(await store.status(input)).toEqual({ available: false });
  });

  it("rejects path traversal and symlinks before changing files", async () => {
    const { root, store, input } = await fixture();
    await expect(
      store.capture({ ...input, messageId: "../outside" }),
    ).rejects.toThrow("Invalid session ID");
    await store.capture(input);
    await rm(path.join(root, "tracked.txt"));
    await symlink(
      path.join(root, "outside.txt"),
      path.join(root, "tracked.txt"),
    );
    await writeFile(path.join(root, "outside.txt"), "preserve");
    await expect(store.restore(input)).rejects.toThrow("symbolic links");
    expect(await readFile(path.join(root, "outside.txt"), "utf8")).toBe(
      "preserve",
    );
  });

  it("restores a deletion captured before a turn", async () => {
    const { root, store, input } = await fixture();
    await rm(path.join(root, "tracked.txt"));
    await store.capture(input);
    await writeFile(path.join(root, "tracked.txt"), "resurrected");
    await store.restore(input);
    await expect(
      readFile(path.join(root, "tracked.txt")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("captures and restores secondary workspace roots", async () => {
    const first = await fixture();
    const secondary = await mkdtemp(
      path.join(tmpdir(), "cocurdex-checkpoint-secondary-"),
    );
    directories.push(secondary);
    const secondaryGit = async (...args: string[]) =>
      (
        await execute("git", args, {
          cwd: secondary,
          env: {
            ...process.env,
            GIT_AUTHOR_NAME: "Test",
            GIT_AUTHOR_EMAIL: "test@example.com",
            GIT_COMMITTER_NAME: "Test",
            GIT_COMMITTER_EMAIL: "test@example.com",
          },
        })
      ).stdout;
    await secondaryGit("init");
    await writeFile(path.join(secondary, "secondary.txt"), "base");
    await secondaryGit("add", ".");
    await secondaryGit("-c", "commit.gpgsign=false", "commit", "-m", "Initial");

    const input = {
      ...first.input,
      workspaceRootPaths: [first.root, secondary],
    };
    await first.store.capture(input);
    await writeFile(path.join(secondary, "secondary.txt"), "agent output");
    await writeFile(path.join(secondary, "created.txt"), "new output");
    await writeFile(path.join(first.root, "tracked.txt"), "agent output");

    await first.store.restore(input);

    expect(await readFile(path.join(secondary, "secondary.txt"), "utf8")).toBe(
      "base",
    );
    await expect(
      readFile(path.join(secondary, "created.txt")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(path.join(first.root, "tracked.txt"), "utf8")).toBe(
      "base",
    );
  });

  it("rejects a checkpoint when the workspace root set changes", async () => {
    const first = await fixture();
    const second = await fixture();
    const input = {
      ...first.input,
      workspaceRootPaths: [first.root, second.root],
    };
    await first.store.capture(input);
    await expect(
      first.store.restore({ ...input, workspaceRootPaths: [first.root] }),
    ).rejects.toThrow("current session workspace");
    expect(await first.store.status(input)).toEqual({ available: true });
  });
});
