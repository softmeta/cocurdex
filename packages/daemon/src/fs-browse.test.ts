import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listHostDirectories } from "./fs-browse";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("listHostDirectories", () => {
  it("lists only directories, sorted, with hidden flags", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "cd-browse-"));
    directories.push(root);
    await mkdir(path.join(root, "beta"));
    await mkdir(path.join(root, ".hidden"));
    await mkdir(path.join(root, "alpha"));
    await writeFile(path.join(root, "file.txt"), "x");

    const resolved = await realpath(root);
    const listing = await listHostDirectories(root);

    expect(listing.path).toBe(resolved);
    expect(listing.parent).toBe(path.dirname(resolved));
    expect(listing.entries.map((entry) => entry.name)).toEqual([
      ".hidden",
      "alpha",
      "beta",
    ]);
    expect(listing.entries[0]).toMatchObject({ hidden: true });
    expect(listing.entries[1]).toMatchObject({
      hidden: false,
      path: path.join(resolved, "alpha"),
    });
  });

  it("reports a null parent at the filesystem root", async () => {
    const listing = await listHostDirectories(path.parse("/").root);
    expect(listing.parent).toBeNull();
  });

  it("rejects for a missing directory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "cd-browse-"));
    directories.push(root);
    await expect(
      listHostDirectories(path.join(root, "missing")),
    ).rejects.toThrow();
  });
});
