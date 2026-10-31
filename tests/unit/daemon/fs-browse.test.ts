import { mkdir, realpath, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { listHostDirectories } from "@cocurdex/daemon/internal/fs-browse";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();

afterEach(async () => {
  await tempDirs.cleanup();
});

describe("listHostDirectories", () => {
  it("lists only directories, sorted, with hidden flags", async () => {
    const root = await tempDirs.create("cd-browse-");
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

  it("includes symlinked directories but not symlinked files", async () => {
    const root = await tempDirs.create("cd-browse-");
    const target = await tempDirs.create("cd-browse-target-");
    await mkdir(path.join(target, "linked-dir"));
    await writeFile(path.join(target, "linked-file.txt"), "x");
    await symlink(
      path.join(target, "linked-dir"),
      path.join(root, "linked-dir"),
    );
    await symlink(
      path.join(target, "linked-file.txt"),
      path.join(root, "linked-file.txt"),
    );
    await symlink(path.join(target, "missing"), path.join(root, "broken-link"));

    const listing = await listHostDirectories(root);
    expect(listing.entries.map((entry) => entry.name)).toEqual(["linked-dir"]);
  });

  it("rejects for a missing directory", async () => {
    const root = await tempDirs.create("cd-browse-");
    await expect(
      listHostDirectories(path.join(root, "missing")),
    ).rejects.toThrow();
  });
});
