import type {
  SessionRecord,
  WorkspaceRecord,
  WorkspaceWorktreeEnvironment,
  WorktreeSettings,
} from "@cocurdex/shared";
import { logDaemonDiagnostic } from "./diagnostics";
import { removeAppManagedWorktree } from "./orchestration-workspace";
import type { DaemonState } from "./state";
import {
  createManagedWorktree,
  listManagedWorktrees,
  loadWorktreeSettings,
  removeManagedWorktree,
  resolveWorktreeRepoRootPath,
  runWorktreeCleanup,
  saveWorktreeSettings,
} from "./worktree-management";
import { runWorktreeLifecycleScript } from "./worktree-script";
import { WorktreeSetupRuns, waitForWorktreeSetup } from "./worktree-setup-runs";

export class WorktreeLifecycle {
  private readonly setupRuns = new WorktreeSetupRuns();

  constructor(
    private readonly state: DaemonState,
    private readonly userDataPath: string,
    private readonly getWorktreeEnvironment: (
      workspaceId: string,
    ) => Promise<WorkspaceWorktreeEnvironment>,
    private readonly invalidateScanPolicy: () => void,
  ) {}

  waitForSetup(
    input: Omit<Parameters<typeof waitForWorktreeSetup>[0], "runs">,
  ) {
    return waitForWorktreeSetup({ ...input, runs: this.setupRuns });
  }

  async runWorktreeSetup(input: {
    workspaceId: string;
    worktreePath: string;
  }): Promise<{ ran: boolean }> {
    const environment = await this.getWorktreeEnvironment(input.workspaceId);
    if (!environment.setupScript.trim()) {
      return { ran: false };
    }
    await runWorktreeLifecycleScript({
      script: environment.setupScript,
      cwd: input.worktreePath,
    });
    return { ran: true };
  }

  getWorktreeSettings() {
    return loadWorktreeSettings(this.state, this.userDataPath);
  }

  saveWorktreeSettings(settings: WorktreeSettings) {
    return saveWorktreeSettings(this.state, this.userDataPath, settings);
  }

  listManagedWorktrees() {
    return listManagedWorktrees({
      state: this.state,
      userDataPath: this.userDataPath,
    });
  }

  async createWorktree(input: {
    workspaceId: string;
    branch?: string;
    startPoint?: string;
  }) {
    this.invalidateScanPolicy();
    try {
      return await createManagedWorktree({
        state: this.state,
        userDataPath: this.userDataPath,
        workspaceId: input.workspaceId,
        branch: input.branch,
        startPoint: input.startPoint,
        startSetup: async (worktreePath) => {
          const environment = await this.getWorktreeEnvironment(
            input.workspaceId,
          );
          const script = environment.setupScript.trim();
          if (script) {
            this.setupRuns.start(worktreePath, script, () =>
              runWorktreeLifecycleScript({ script, cwd: worktreePath }),
            );
          }
        },
      });
    } finally {
      this.invalidateScanPolicy();
    }
  }

  async removeWorktree(input: {
    workspaceId: string;
    worktreePath: string;
    workspaceRootPath?: string;
  }) {
    this.invalidateScanPolicy();
    try {
      return await removeManagedWorktree({
        state: this.state,
        userDataPath: this.userDataPath,
        workspaceId: input.workspaceId,
        worktreePath: input.worktreePath,
        workspaceRootPath: input.workspaceRootPath,
        runCleanup: async (worktreePath) => {
          try {
            await runWorktreeCleanup({
              state: this.state,
              workspaceId: input.workspaceId,
              worktreePath,
            });
          } catch (error) {
            logDaemonDiagnostic("warn", "worktree.cleanup failed", {
              error: error instanceof Error ? error.message : String(error),
              workspaceId: input.workspaceId,
              worktreePath,
            });
          }
        },
      });
    } finally {
      this.invalidateScanPolicy();
    }
  }

  async releaseSessionWorktree(
    session: SessionRecord,
    workspace: WorkspaceRecord | undefined,
  ) {
    const worktreePath = session.worktreePath?.trim();
    if (!worktreePath || !workspace) {
      return;
    }

    const [activeSessions, archivedSessions] = await Promise.all([
      this.state.listSessions(),
      this.state.listArchivedSessions(),
    ]);
    const stillBound = [...activeSessions, ...archivedSessions].some(
      (candidate) => candidate.worktreePath === worktreePath,
    );
    if (stillBound) {
      return;
    }

    const environment = await this.getWorktreeEnvironment(session.workspaceId);
    if (environment.cleanupScript.trim()) {
      try {
        await runWorktreeLifecycleScript({
          script: environment.cleanupScript,
          cwd: worktreePath,
        });
      } catch (error) {
        logDaemonDiagnostic("warn", "worktree.cleanup failed", {
          error: error instanceof Error ? error.message : String(error),
          sessionId: session.id,
          worktreePath,
        });
      }
    }

    const settings = await loadWorktreeSettings(this.state, this.userDataPath);
    const repoRootPath = await resolveWorktreeRepoRootPath(
      workspace,
      worktreePath,
    );
    await removeAppManagedWorktree({
      repoRootPath,
      worktreePath,
      userDataPath: this.userDataPath,
      worktreeRootPath: settings.rootPath,
    });
  }
}
