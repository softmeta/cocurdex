import { decideWorkspaceIsolation } from "@cocurdex/shared/internal/orchestration";
import { describe, expect, it } from "vitest";

describe("orchestration helpers", () => {
  it("keeps read-only work in the shared workspace", () => {
    expect(
      decideWorkspaceIsolation({
        writeMode: "read-only",
        hasParallelWriteTasks: true,
        isRepoDirty: true,
      }),
    ).toEqual({
      mode: "shared-read",
      allowed: true,
      reason: null,
    });
  });

  it("blocks parallel writes when the repository is dirty", () => {
    expect(
      decideWorkspaceIsolation({
        writeMode: "native-write",
        hasParallelWriteTasks: true,
        isRepoDirty: true,
      }),
    ).toEqual({
      mode: "git-worktree",
      allowed: false,
      reason: "Parallel write tasks require a clean repository.",
    });
  });

  it("uses patch sandbox only when parallel writes allow it", () => {
    expect(
      decideWorkspaceIsolation({
        writeMode: "native-write",
        hasParallelWriteTasks: true,
        isRepoDirty: false,
        canUsePatchSandbox: true,
      }),
    ).toMatchObject({ mode: "patch-sandbox", allowed: true });
  });
});
