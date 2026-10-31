import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  fileExists,
  listWorkspaceDirectory,
  listWorkspaceFiles,
} from "@cocurdex/daemon/internal/workspace-service";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

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
  const tempDirs = createTempDirs();
  let dir: string;
  let filePath: string;

  beforeAll(async () => {
    dir = await tempDirs.create("file-exists-");
    filePath = join(dir, "note.txt");
    await writeFile(filePath, "hello", "utf8");
  });

  afterAll(async () => {
    await tempDirs.cleanup();
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
  const tempDirs = createTempDirs();

  afterEach(async () => {
    await tempDirs.cleanup();
  });

  async function createRoot() {
    const root = await tempDirs.create("workspace-files-");
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

describe("listWorkspaceDirectory", () => {
  const tempDirs = createTempDirs();

  afterAll(async () => {
    await tempDirs.cleanup();
  });

  it("lists a directory the capped workspace listing left out", async () => {
    const root = await tempDirs.create("workspace-dir-");
    const huge = join(root, "aaa-huge");
    await mkdir(huge);
    await Promise.all(
      Array.from({ length: FILE_RESULT_LIMIT }, (_, index) =>
        writeFile(join(huge, `f${index}.txt`), "x"),
      ),
    );
    await mkdir(join(root, "zzz", "auth", "nested"), { recursive: true });
    await writeFile(join(root, "zzz", "auth", "token.ts"), "x");
    await writeFile(join(root, "zzz", "auth", "nested", "deep.ts"), "x");
    await mkdir(join(root, "zzz", "auth", "node_modules"));

    const capped = (await listWorkspaceFiles(root)).map(
      (entry) => entry.relativePath,
    );
    expect(capped).not.toContain("zzz/auth/token.ts");

    const children = await listWorkspaceDirectory(root, "zzz/auth");
    expect(
      children.map(({ kind, relativePath }) => ({ kind, relativePath })),
    ).toEqual([
      { kind: "directory", relativePath: "zzz/auth/nested" },
      { kind: "file", relativePath: "zzz/auth/token.ts" },
    ]);
    expect(children[1]?.path).toBe(join(root, "zzz", "auth", "token.ts"));
  });

  it("refuses paths that leave the workspace root", async () => {
    const parent = await tempDirs.create("workspace-escape-");
    const root = join(parent, "root");
    await mkdir(root);
    await writeFile(join(parent, "secret.txt"), "x");

    expect(await listWorkspaceDirectory(root, "..")).toEqual([]);
    expect(await listWorkspaceDirectory(root, "a/../..")).toEqual([]);
    expect(await listWorkspaceDirectory(root, parent)).toEqual([]);
  });

  it("accepts redundant separators and stays fast on long slash runs", async () => {
    const root = await tempDirs.create("workspace-slashes-");
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src", "index.ts"), "x");

    expect(
      (await listWorkspaceDirectory(root, "src//")).map(
        (entry) => entry.relativePath,
      ),
    ).toEqual(["src/index.ts"]);

    const startedAt = performance.now();
    await listWorkspaceDirectory(root, `${"/".repeat(100_000)}x`);
    expect(performance.now() - startedAt).toBeLessThan(1000);
  });

  it("returns nothing for a missing directory", async () => {
    const root = await tempDirs.create("workspace-missing-");
    expect(await listWorkspaceDirectory(root, "gone")).toEqual([]);
  });
});
