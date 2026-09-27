import { mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveWorkspaceOpenPath } from "./workspace-open-path";

const allowFile = { allowFile: true };

describe("resolveWorkspaceOpenPath", () => {
  it("returns the canonical directory when a folder is opened", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "cocurdex-open-dir-"));
    await expect(resolveWorkspaceOpenPath(dir, [], allowFile)).resolves.toBe(
      await realpath(dir),
    );
  });

  it("opens the parent directory of a file only when files are allowed", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "cocurdex-open-file-"));
    const filePath = path.join(dir, "readme.md");
    await writeFile(filePath, "hi");

    await expect(
      resolveWorkspaceOpenPath(filePath, [], allowFile),
    ).resolves.toBe(await realpath(dir));
    await expect(
      resolveWorkspaceOpenPath(filePath, [], { allowFile: false }),
    ).resolves.toBeNull();
  });

  it("returns null for a missing path", async () => {
    await expect(
      resolveWorkspaceOpenPath(
        path.join(tmpdir(), "cocurdex-open-missing", "nope"),
        [],
        allowFile,
      ),
    ).resolves.toBeNull();
  });

  it("reuses an existing workspace rootPath for the same directory", async () => {
    const dir = await realpath(
      await mkdtemp(path.join(tmpdir(), "cocurdex-open-reuse-")),
    );
    const stored = `${dir}${path.sep}`;
    await expect(
      resolveWorkspaceOpenPath(dir, [stored], allowFile),
    ).resolves.toBe(stored);
  });
});
