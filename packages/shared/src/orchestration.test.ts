import { describe, expect, it } from "vitest";
import {
  type AgentRuntimeRecord,
  canDispatchToRuntime,
  decideWorkspaceIsolation,
} from "./orchestration";

const runtime: AgentRuntimeRecord = {
  id: "runtime-1",
  agentId: "codex",
  scope: "local",
  status: "online",
  version: "1.0.0",
  supportedModels: ["gpt-5"],
  capacity: {
    maxConcurrentTasks: 2,
    activeTaskCount: 1,
  },
  health: {
    lastCheckedAt: "2026-05-24T00:00:00.000Z",
    message: null,
  },
};

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

  it("dispatches only to online runtimes with remaining capacity", () => {
    expect(canDispatchToRuntime(runtime)).toBe(true);
    expect(
      canDispatchToRuntime({
        ...runtime,
        capacity: { maxConcurrentTasks: 1, activeTaskCount: 1 },
      }),
    ).toBe(false);
    expect(canDispatchToRuntime({ ...runtime, status: "degraded" })).toBe(
      false,
    );
  });
});
