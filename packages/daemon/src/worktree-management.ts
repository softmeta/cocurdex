import type { WorkspaceRecord } from "@cocurdex/shared";
import {
  type GitWorktreeInfo,
  type ManagedWorktree,
  parseWorktreeSettings,
  primaryWorkspaceRootPath,
  serializeWorktreeSettings,
  sessionsUsingWorktreePath,
  WORKTREE_SETTING_KEY,
  type WorktreeSettings,
  type WorktreeSettingsSnapshot,
} from "@cocurdex/shared";
import { addGitWorktree, listGitWorktrees } from "./git-worktree";
import { removeAppManagedWorktree } from "./orchestration-workspace";
import { getWorktreeBasePath, isAppManagedWorktreePath } from "./paths";
import type { DaemonState } from "./state";
import { runWorktreeLifecycleScript } from "./worktree-script";

export async function loadWorktreeSettings(
  state: DaemonState,
  userDataPath: string,
): Promise<WorktreeSettingsSnapshot> {
  const settings = parseWorktreeSettings(
    await state.getAppSetting(WORKTREE_SETTING_KEY),
  );
  return {
    ...settings,
    resolvedRootPath: getWorktreeBasePath(userDataPath, settings.rootPath),
  };
}

export async function saveWorktreeSettings(
  state: DaemonState,
  userDataPath: string,
  next: WorktreeSettings,
): Promise<WorktreeSettingsSnapshot> {
  const settings = parseWorktreeSettings(serializeWorktreeSettings(next));
  await state.setAppSetting(
    WORKTREE_SETTING_KEY,
    serializeWorktreeSettings(settings),
  );
  return {
    ...settings,
    resolvedRootPath: getWorktreeBasePath(userDataPath, settings.rootPath),
  };
}

export async function listManagedWorktrees(input: {
  state: DaemonState;
  userDataPath: string;
}): Promise<ManagedWorktree[]> {
  const settings = await loadWorktreeSettings(input.state, input.userDataPath);
  const [workspaces, sessions, archivedSessions] = await Promise.all([
    input.state.listWorkspaces(),
    input.state.listSessions(),
    input.state.listArchivedSessions(),
  ]);
  const boundSessions = [...sessions, ...archivedSessions];
  const items: ManagedWorktree[] = [];

  for (const workspace of workspaces) {
    for (const rootPath of workspace.rootPaths) {
      const worktrees = await listGitWorktrees(rootPath);
      for (const worktree of worktrees) {
        if (
          !isAppManagedWorktreePath(
            worktree.path,
            input.userDataPath,
            settings.rootPath,
          )
        ) {
          continue;
        }
        items.push({
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          workspaceRootPath: rootPath,
          path: worktree.path,
          branch: worktree.branch,
          head: worktree.head,
          detached: worktree.detached,
          sessions: sessionsUsingWorktreePath(boundSessions, worktree.path),
        });
      }
    }
  }

  return items;
}

export async function createManagedWorktree(input: {
  state: DaemonState;
  userDataPath: string;
  workspaceId: string;
  branch: string;
  startPoint?: string;
  runSetup(worktreePath: string): Promise<void>;
}): Promise<GitWorktreeInfo> {
  const workspace = await requireWorkspace(input.state, input.workspaceId);
  const settings = await loadWorktreeSettings(input.state, input.userDataPath);
  const created = await addGitWorktree({
    repoRootPath: primaryWorkspaceRootPath(workspace),
    branch: input.branch,
    startPoint: input.startPoint,
    userDataPath: input.userDataPath,
    worktreeRootPath: settings.rootPath,
    fetchBeforeCreate: settings.fetchBeforeCreate,
  });
  await input.runSetup(created.path);
  return created;
}

export async function removeManagedWorktree(input: {
  state: DaemonState;
  userDataPath: string;
  workspaceId: string;
  worktreePath: string;
  runCleanup(worktreePath: string): Promise<void>;
}): Promise<{ removed: boolean }> {
  const workspace = await requireWorkspace(input.state, input.workspaceId);
  const settings = await loadWorktreeSettings(input.state, input.userDataPath);
  if (
    !isAppManagedWorktreePath(
      input.worktreePath,
      input.userDataPath,
      settings.rootPath,
    )
  ) {
    throw new Error("Only Cocurdex-managed worktrees can be removed.");
  }

  const [sessions, archivedSessions] = await Promise.all([
    input.state.listSessions(),
    input.state.listArchivedSessions(),
  ]);
  const bound = sessionsUsingWorktreePath(
    [...sessions, ...archivedSessions],
    input.worktreePath,
  );
  if (bound.length > 0) {
    throw new Error(
      bound.length === 1
        ? `Session "${bound[0]?.title}" still uses this worktree.`
        : `${bound.length} sessions still use this worktree.`,
    );
  }

  await input.runCleanup(input.worktreePath);
  const removed = await removeAppManagedWorktree({
    repoRootPath: primaryWorkspaceRootPath(workspace),
    worktreePath: input.worktreePath,
    userDataPath: input.userDataPath,
    worktreeRootPath: settings.rootPath,
  });
  if (!removed) {
    throw new Error("Could not remove this worktree.");
  }
  return { removed: true };
}

export async function runWorktreeCleanup(input: {
  state: DaemonState;
  workspaceId: string;
  worktreePath: string;
}) {
  const environment = await input.state.getWorktreeEnvironment(
    input.workspaceId,
  );
  const script = environment?.cleanupScript.trim() ?? "";
  if (!script) {
    return;
  }
  await runWorktreeLifecycleScript({
    script,
    cwd: input.worktreePath,
  });
}

async function requireWorkspace(state: DaemonState, workspaceId: string) {
  const workspace = (await state.listWorkspaces()).find(
    (candidate: WorkspaceRecord) => candidate.id === workspaceId,
  );
  if (!workspace) {
    throw new Error(`Workspace ${workspaceId} was not found`);
  }
  return workspace;
}
