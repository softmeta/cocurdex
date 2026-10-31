import { mkdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assertSafeRestorePlan,
  assertSafeWorkspaceFile,
  normalizeRelativePath,
  resolveWorkspacePath,
  sanitizeTurnFileChange,
  UnsafeWorkspacePathError,
} from "@cocurdex/daemon/internal/workspace-changes/path-safety";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();

afterAll(() => tempDirs.cleanup());

describe("workspace path safety", () => {
  it("rejects traversal and absolute paths", () => {
    expect(() => normalizeRelativePath("../secret")).toThrow(
      UnsafeWorkspacePathError,
    );
    expect(() => normalizeRelativePath("/etc/passwd")).toThrow(
      UnsafeWorkspacePathError,
    );
    expect(() => normalizeRelativePath("foo/../../etc/passwd")).toThrow(
      UnsafeWorkspacePathError,
    );
    expect(() => normalizeRelativePath("C:\\outside.txt")).toThrow(
      UnsafeWorkspacePathError,
    );
    expect(() => normalizeRelativePath("C:outside.txt")).toThrow(
      UnsafeWorkspacePathError,
    );
  });

  it("resolves a nested relative path inside the workspace", () => {
    const resolved = resolveWorkspacePath("/tmp/workspace", "src/a.ts");
    expect(resolved.relative).toBe("src/a.ts");
    expect(resolved.absolute).toBe(path.resolve("/tmp/workspace/src/a.ts"));
  });

  it("rejects a missing file whose parent was replaced with an external symlink", async () => {
    const workspace = await tempDirs.create("cocurdex-path-ws-");
    const outside = await tempDirs.create("cocurdex-path-out-");
    await mkdir(path.join(workspace, "notes"), { recursive: true });
    await writeFile(path.join(workspace, "notes/a.md"), "inside\n", "utf8");
    const { rm } = await import("node:fs/promises");
    await rm(path.join(workspace, "notes"), { recursive: true, force: true });
    await symlink(outside, path.join(workspace, "notes"));

    await expect(
      assertSafeWorkspaceFile(workspace, "notes/a.md"),
    ).rejects.toBeInstanceOf(UnsafeWorkspacePathError);
  });

  it("rejects rename sources that escape the workspace", async () => {
    const workspace = await tempDirs.create("cocurdex-path-ws-");
    await expect(
      assertSafeRestorePlan(workspace, {
        path: "moved.md",
        previousPath: "../outside.txt",
      }),
    ).rejects.toBeInstanceOf(UnsafeWorkspacePathError);
  });

  it("drops provider paths that are not workspace-relative", () => {
    expect(
      sanitizeTurnFileChange({
        path: "../outside.txt",
        operation: "modify",
        reviewKind: "text",
      }),
    ).toBeNull();
    expect(
      sanitizeTurnFileChange({
        path: "ok.md",
        previousPath: "/tmp/escape.md",
        operation: "rename",
        reviewKind: "text",
      }),
    ).toBeNull();
  });
});
