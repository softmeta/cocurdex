import { mkdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { createWorkspaceScanPolicy } from "@cocurdex/daemon/internal/scan-roots";
import type { DaemonState } from "@cocurdex/daemon/internal/state";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();

afterAll(() => tempDirs.cleanup());

function stateWithRoots(workspaceRootPaths: string[], onList = () => {}) {
  return {
    listWorkspaces: async () => {
      onList();
      return workspaceRootPaths.map((rootPath) => ({ rootPaths: [rootPath] }));
    },
    listSessions: async () => [],
    listArchivedSessions: async () => [],
  } as unknown as DaemonState;
}

describe("workspace scan policy", () => {
  it("allows files inside a registered workspace and rejects others", async () => {
    const workspaceRootPath = await tempDirs.create("cocurdex-scan-");
    const filePath = path.join(workspaceRootPath, "src", "app.ts");
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, "x", "utf8");

    const policy = createWorkspaceScanPolicy(
      stateWithRoots([workspaceRootPath]),
    );

    await expect(policy.canAccessFile(filePath)).resolves.toBe(true);
    await expect(policy.canAccessFile("/etc/hosts")).resolves.toBe(false);
    await expect(policy.canScan(workspaceRootPath)).resolves.toBe(true);
    await expect(
      policy.canScan(path.join(workspaceRootPath, "src")),
    ).resolves.toBe(false);
  });

  it("rejects files escaping the workspace through a symlink", async () => {
    const workspaceRootPath = await tempDirs.create("cocurdex-scan-");
    const outsideDir = await tempDirs.create("cocurdex-outside-");
    const escaped = path.join(outsideDir, "secret.txt");
    await writeFile(escaped, "x", "utf8");
    await symlink(outsideDir, path.join(workspaceRootPath, "linked"), "dir");

    const policy = createWorkspaceScanPolicy(
      stateWithRoots([workspaceRootPath]),
    );

    await expect(
      policy.canAccessFile(
        path.join(workspaceRootPath, "linked", "secret.txt"),
      ),
    ).resolves.toBe(false);
  });

  it("loads workspace roots once for concurrent file checks", async () => {
    const workspaceRootPath = await tempDirs.create("cocurdex-scan-");
    const filePaths = Array.from({ length: 40 }, (_, index) =>
      path.join(workspaceRootPath, `file-${index}.ts`),
    );
    await Promise.all(filePaths.map((filePath) => writeFile(filePath, "x")));
    let loads = 0;
    const policy = createWorkspaceScanPolicy(
      stateWithRoots([workspaceRootPath], () => {
        loads += 1;
      }),
    );

    const allowed = await Promise.all(
      filePaths.map((filePath) => policy.canAccessFile(filePath)),
    );

    expect(allowed.every(Boolean)).toBe(true);
    expect(loads).toBe(1);
  });

  it("sees a workspace added while roots are loading", async () => {
    const firstRootPath = await tempDirs.create("cocurdex-scan-");
    const addedRootPath = await tempDirs.create("cocurdex-scan-");
    const addedFile = path.join(addedRootPath, "app.ts");
    await writeFile(addedFile, "x");
    const roots = [firstRootPath];
    const policy = createWorkspaceScanPolicy(stateWithRoots(roots));

    const pending = policy.canAccessFile(addedFile);
    roots.push(addedRootPath);
    policy.invalidate();

    await expect(pending).resolves.toBe(true);
    await expect(policy.canAccessFile(addedFile)).resolves.toBe(true);
  });
});
