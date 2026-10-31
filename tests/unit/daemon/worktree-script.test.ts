import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runWorktreeLifecycleScript } from "@cocurdex/daemon/internal/worktree-script";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();

afterEach(async () => {
  await tempDirs.cleanup();
});

describe("runWorktreeLifecycleScript", () => {
  it("does nothing when the script is blank", async () => {
    const cwd = await tempDirs.create("cocurdex-script-");
    await expect(
      runWorktreeLifecycleScript({ script: "  \n", cwd }),
    ).resolves.toBe("");
  });

  it("runs the script in the given working directory", async () => {
    if (process.platform === "win32") {
      return;
    }
    const cwd = await tempDirs.create("cocurdex-script-");
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
    const cwd = await tempDirs.create("cocurdex-script-");
    await writeFile(path.join(cwd, "keep.txt"), "ok\n");
    await expect(
      runWorktreeLifecycleScript({ script: "exit 2", cwd }),
    ).rejects.toThrow();
  });
});
