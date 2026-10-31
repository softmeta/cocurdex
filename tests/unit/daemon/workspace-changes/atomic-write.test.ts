import { chmod, lstat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { writeFileAtomically } from "@cocurdex/daemon/internal/workspace-changes/atomic-write";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();

afterAll(() => tempDirs.cleanup());

describe("writeFileAtomically", () => {
  it("preserves executable bits when replacing a file", async () => {
    if (process.platform === "win32") {
      return;
    }
    const directory = await tempDirs.create("cocurdex-atomic-");
    const target = path.join(directory, "tool.sh");
    await writeFile(target, "old\n", "utf8");
    await chmod(target, 0o755);
    await writeFileAtomically(target, Buffer.from("new\n"));
    expect(await readFile(target, "utf8")).toBe("new\n");
    expect((await lstat(target)).mode & 0o777).toBe(0o755);
  });

  it("preserves a restrictive file mode", async () => {
    if (process.platform === "win32") {
      return;
    }
    const directory = await tempDirs.create("cocurdex-atomic-");
    const target = path.join(directory, "secret.env");
    await writeFile(target, "old\n", { mode: 0o600 });
    await chmod(target, 0o600);
    await writeFileAtomically(target, Buffer.from("new\n"));
    expect((await lstat(target)).mode & 0o777).toBe(0o600);
  });

  it("does not leave a temp file after a failed replace", async () => {
    const directory = await tempDirs.create("cocurdex-atomic-");
    const target = path.join(directory, "file.txt");
    const { mkdir, readdir } = await import("node:fs/promises");
    await mkdir(target);
    await expect(
      writeFileAtomically(target, Buffer.from("x")),
    ).rejects.toThrow();
    const leftover = (await readdir(directory)).filter((name) =>
      name.startsWith(".cocurdex-restore-"),
    );
    expect(leftover).toEqual([]);
  });
});
