import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runWorktreeLifecycleScript } from "./worktree-script";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("runWorktreeLifecycleScript", () => {
  it("does nothing when the script is blank", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "cocurdex-script-"));
    temporaryDirectories.push(cwd);
    await expect(
      runWorktreeLifecycleScript({ script: "  \n", cwd }),
    ).resolves.toBeUndefined();
  });

  it("runs the script in the given working directory", async () => {
    if (process.platform === "win32") {
      return;
    }
    const cwd = await mkdtemp(path.join(tmpdir(), "cocurdex-script-"));
    temporaryDirectories.push(cwd);
    await mkdir(cwd, { recursive: true });
    await runWorktreeLifecycleScript({
      script: "printf ready > marker.txt",
      cwd,
    });
    expect(await readFile(path.join(cwd, "marker.txt"), "utf8")).toBe("ready");
  });

  it("rejects when the script exits non-zero", async () => {
    if (process.platform === "win32") {
      return;
    }
    const cwd = await mkdtemp(path.join(tmpdir(), "cocurdex-script-"));
    temporaryDirectories.push(cwd);
    await writeFile(path.join(cwd, "keep.txt"), "ok\n");
    await expect(
      runWorktreeLifecycleScript({ script: "exit 2", cwd }),
    ).rejects.toThrow();
  });
});
