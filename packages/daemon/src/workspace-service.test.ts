import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listWorkspaceFiles } from "./workspace-service";

const tempRoots: string[] = [];

async function createTempWorkspace() {
  const rootPath = await mkdtemp(path.join(tmpdir(), "cocurdex-workspace-"));
  tempRoots.push(rootPath);
  return rootPath;
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    tempRoots.splice(0).map((rootPath) =>
      rm(rootPath, {
        force: true,
        recursive: true,
      }),
    ),
  );
});

describe("listWorkspaceFiles", () => {
  it("returns files and directories with explicit kinds", async () => {
    const rootPath = await createTempWorkspace();
    await mkdir(path.join(rootPath, "src", "components"), { recursive: true });
    await writeFile(path.join(rootPath, "src", "index.ts"), "export {};\n");

    const entries = await listWorkspaceFiles(rootPath);

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "directory",
          name: "src",
          path: path.join(rootPath, "src"),
          relativePath: "src",
        }),
        expect.objectContaining({
          kind: "directory",
          name: "components",
          path: path.join(rootPath, "src", "components"),
          relativePath: "src/components",
        }),
        expect.objectContaining({
          kind: "file",
          name: "index.ts",
          path: path.join(rootPath, "src", "index.ts"),
          relativePath: "src/index.ts",
        }),
      ]),
    );
  });
});
