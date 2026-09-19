import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { fileExists, listWorkspaceFiles } from "./workspace-service";

vi.mock("node:child_process", () => ({
  execFile: (
    _file: string,
    _args: string[],
    _options: unknown,
    callback: (error: Error, stdout: string, stderr: string) => void,
  ) => {
    callback(new Error("fd unavailable"), "", "");
  },
}));

describe("fileExists", () => {
  let dir: string;
  let filePath: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "file-exists-"));
    filePath = join(dir, "note.txt");
    await writeFile(filePath, "hello", "utf8");
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns true for an existing regular file", async () => {
    expect(await fileExists(filePath)).toBe(true);
  });

  it("returns false for a directory", async () => {
    expect(await fileExists(dir)).toBe(false);
  });

  it("returns false for a missing path", async () => {
    expect(await fileExists(join(dir, "missing.txt"))).toBe(false);
  });
});

const FILE_RESULT_LIMIT = 5000;

describe("listWorkspaceFiles", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  async function createRoot() {
    const root = await mkdtemp(join(tmpdir(), "workspace-files-"));
    roots.push(root);
    return root;
  }

  it("keeps shallow entries when a deep directory exhausts the result limit", async () => {
    const root = await createRoot();
    const huge = join(root, "aaa-huge");
    await mkdir(huge);
    for (let index = 0; index < FILE_RESULT_LIMIT + 100; index += 100) {
      await Promise.all(
        Array.from({ length: 100 }, (_, offset) =>
          writeFile(join(huge, `f${index + offset}.txt`), "x"),
        ),
      );
    }
    await mkdir(join(root, "bbb-sibling"));
    await writeFile(join(root, "top.txt"), "x");

    const listing = await listWorkspaceFiles(root);
    const relativePaths = listing.map((entry) => entry.relativePath);

    expect(relativePaths.slice(0, 3)).toEqual([
      "aaa-huge",
      "bbb-sibling",
      "top.txt",
    ]);
    expect(listing).toHaveLength(FILE_RESULT_LIMIT);

    const depths = relativePaths.map((path) => path.split("/").length);
    expect(depths).toEqual([...depths].sort((left, right) => left - right));
  });

  it("skips pnpm store directories", async () => {
    const root = await createRoot();
    const store = join(root, ".pnpm-store", "v11", "files", "ab");
    await mkdir(store, { recursive: true });
    await writeFile(join(store, "blob"), "x");
    await mkdir(join(root, "app"));
    await writeFile(join(root, "app", "index.ts"), "x");

    const relativePaths = (await listWorkspaceFiles(root)).map(
      (entry) => entry.relativePath,
    );

    expect(relativePaths).toContain("app");
    expect(relativePaths.some((path) => path.startsWith(".pnpm-store"))).toBe(
      false,
    );
  });
});
