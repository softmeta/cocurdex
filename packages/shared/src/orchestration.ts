import type { AgentId, WriteMode } from "./contracts";

export type AgentRuntimeScope = "local" | "remote" | "cloud";
export type AgentRuntimeStatus = "online" | "offline" | "degraded";

export interface AgentRuntimeRecord {
  id: string;
  agentId: AgentId;
  scope: AgentRuntimeScope;
  status: AgentRuntimeStatus;
  version: string | null;
  supportedModels: string[];
  capacity: {
    maxConcurrentTasks: number;
    activeTaskCount: number;
  };
  health: {
    lastCheckedAt: string;
    message: string | null;
  };
}

export type WorkspaceIsolationMode =
  | "shared-read"
  | "patch-sandbox"
  | "git-worktree";
export interface WorkspaceIsolationDecision {
  mode: WorkspaceIsolationMode;
  allowed: boolean;
  reason: string | null;
}

export interface WorkspaceIsolationInput {
  writeMode: WriteMode;
  hasParallelWriteTasks: boolean;
  isRepoDirty: boolean;
  canUsePatchSandbox?: boolean;
}

export function decideWorkspaceIsolation(
  input: WorkspaceIsolationInput,
): WorkspaceIsolationDecision {
  if (input.writeMode === "read-only") {
    return { mode: "shared-read", allowed: true, reason: null };
  }

  if (!input.hasParallelWriteTasks) {
    return { mode: "git-worktree", allowed: true, reason: null };
  }

  if (input.isRepoDirty) {
    return {
      mode: "git-worktree",
      allowed: false,
      reason: "Parallel write tasks require a clean repository.",
    };
  }

  if (input.canUsePatchSandbox) {
    return { mode: "patch-sandbox", allowed: true, reason: null };
  }

  return { mode: "git-worktree", allowed: true, reason: null };
}

export function canDispatchToRuntime(runtime: AgentRuntimeRecord) {
  return (
    runtime.status === "online" &&
    runtime.capacity.activeTaskCount < runtime.capacity.maxConcurrentTasks
  );
}
