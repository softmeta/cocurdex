import path from "node:path";
import { describe, expect, it } from "vitest";
import { createWorktreePath } from "./orchestration-workspace";

describe("orchestration workspace helpers", () => {
  it("places worker worktrees outside the repository under app data", () => {
    const worktreePath = createWorktreePath({
      repoRootPath: "/Users/example/project",
      orchestrationRunId: "run-1",
      agentTaskRunId: "task-1",
      userDataPath: "/tmp/cocurdex-data",
    });

    expect(worktreePath.startsWith("/tmp/cocurdex-data")).toBe(true);
    expect(worktreePath).toContain("worktrees");
    expect(worktreePath).toContain(path.join("run-1", "task-1"));
    expect(worktreePath.startsWith("/Users/example/project")).toBe(false);
  });

  it("uses a stable repository hash in worktree paths", () => {
    const first = createWorktreePath({
      repoRootPath: "/Users/example/project",
      orchestrationRunId: "run-a",
      agentTaskRunId: "task-a",
      userDataPath: "/tmp/cocurdex-data",
    });
    const second = createWorktreePath({
      repoRootPath: "/Users/example/project",
      orchestrationRunId: "run-b",
      agentTaskRunId: "task-b",
      userDataPath: "/tmp/cocurdex-data",
    });

    expect(first.split(path.sep).at(-3)).toBe(second.split(path.sep).at(-3));
  });
});
