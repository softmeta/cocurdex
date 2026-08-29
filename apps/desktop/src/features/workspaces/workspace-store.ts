import type { WorkspaceRecord } from "@cocurdex/shared";
import { atom } from "jotai";
import { desktopApi, type GitBranchInfo } from "@/lib";

// Stamp the moment a workspace becomes active and persist it. "Opening" a
// workspace is an event (select / add / bootstrap-restore), so the IPC write
// lives in those write atoms rather than in a render effect that mirrors the
// active-workspace object.
function persistWorkspaceOpened(workspace: WorkspaceRecord) {
  void desktopApi
    .saveWorkspace({
      ...workspace,
      lastOpenedAt: new Date().toISOString(),
    })
    .catch((error) => {
      console.error("[workspaces] saveWorkspace failed", error);
    });
}

/** Strip trailing slashes for stable rootPath equality (keep root "/"). */
export function normalizeWorkspaceRootPath(rootPath: string): string {
  if (rootPath === "/" || rootPath === "") {
    return rootPath || "/";
  }
  return rootPath.replace(/[\\/]+$/, "");
}

function workspacePathsEqual(left: string, right: string): boolean {
  const a = normalizeWorkspaceRootPath(left);
  const b = normalizeWorkspaceRootPath(right);
  // Windows paths are case-insensitive; Electron renderer may not set process.
  const win =
    (typeof process !== "undefined" && process.platform === "win32") ||
    (typeof navigator !== "undefined" && /Win/i.test(navigator.platform));
  if (win) {
    return a.toLowerCase() === b.toLowerCase();
  }
  return a === b;
}

function workspaceNameFromPath(rootPath: string): string {
  const normalized = normalizeWorkspaceRootPath(rootPath);
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? normalized;
}

export const workspacesAtom = atom<WorkspaceRecord[]>([]);
export const activeWorkspaceIdAtom = atom<string | null>(null);
// The most recent project the user actually selected. Unlike
// activeWorkspaceId, it is NOT cleared when the user drops to chat mode (picks
// "No project"), so the top-level "new session" entry can re-enter that
// project by default. Stays null only for users who have never had a project.
export const lastSelectedWorkspaceIdAtom = atom<string | null>(null);
/** Workspace ids whose session list is collapsed in the projects sidebar. */
export const collapsedWorkspaceIdsAtom = atom<string[]>([]);
export const activeBranchesAtom = atom<GitBranchInfo[]>([]);
export const activeBranchAtom = atom<string | null>(null);

function promoteWorkspaceToFront(
  workspaces: WorkspaceRecord[],
  workspace: WorkspaceRecord,
): WorkspaceRecord[] {
  return [workspace, ...workspaces.filter((item) => item.id !== workspace.id)];
}

function ensureWorkspaceExpanded(
  collapsedIds: string[],
  workspaceId: string,
): string[] {
  return collapsedIds.filter((id) => id !== workspaceId);
}

export const bootstrapWorkspacesAtom = atom(
  null,
  (_get, set, workspaces: WorkspaceRecord[]) => {
    const sorted = [...workspaces].sort((left, right) =>
      right.lastOpenedAt.localeCompare(left.lastOpenedAt),
    );

    set(workspacesAtom, sorted);
    set(activeWorkspaceIdAtom, sorted[0]?.id ?? null);
    set(lastSelectedWorkspaceIdAtom, sorted[0]?.id ?? null);

    if (sorted[0]) {
      persistWorkspaceOpened(sorted[0]);
    }
  },
);

export const selectWorkspaceAtom = atom(
  null,
  (get, set, workspaceId: string) => {
    set(activeWorkspaceIdAtom, workspaceId);
    set(lastSelectedWorkspaceIdAtom, workspaceId);

    const workspace = get(workspacesAtom).find((w) => w.id === workspaceId);
    if (workspace) {
      persistWorkspaceOpened(workspace);
    }
  },
);

export const addWorkspaceAtom = atom(
  null,
  (get, set, workspace: WorkspaceRecord) => {
    const current = get(workspacesAtom);
    const exists = current.find((w) => w.id === workspace.id);
    if (!exists) {
      set(workspacesAtom, [...current, workspace]);
    }
    set(activeWorkspaceIdAtom, workspace.id);
    set(lastSelectedWorkspaceIdAtom, workspace.id);

    persistWorkspaceOpened(workspace);
  },
);

export type OpenWorkspaceByPathResult = {
  workspace: WorkspaceRecord;
  /** True when active project changed (caller should clear foreign session UI). */
  didSwitchProject: boolean;
};

/**
 * Open a workspace by absolute directory path (CLI `cocurdex .` / folder dialog).
 * Reuses an existing record with the same rootPath; otherwise creates one.
 * Always activates the project, promotes it to the top of the list, and expands
 * its session list in the sidebar — matching “open this folder as the project”.
 */
export const openWorkspaceByPathAtom = atom(
  null,
  (get, set, rootPath: string): OpenWorkspaceByPathResult => {
    const normalized = normalizeWorkspaceRootPath(rootPath);
    const previousId = get(activeWorkspaceIdAtom);
    const existing = get(workspacesAtom).find((workspace) =>
      workspacePathsEqual(workspace.rootPath, normalized),
    );

    let workspace: WorkspaceRecord;
    if (existing) {
      set(selectWorkspaceAtom, existing.id);
      workspace = existing;
    } else {
      const now = new Date().toISOString();
      workspace = {
        id: crypto.randomUUID(),
        name: workspaceNameFromPath(normalized),
        rootPath: normalized,
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: now,
      };
      set(addWorkspaceAtom, workspace);
    }

    // Pin the opened project to the top of the projects list (recents order).
    set(
      workspacesAtom,
      promoteWorkspaceToFront(get(workspacesAtom), workspace),
    );
    // Ensure the project's session list is expanded in the sidebar.
    set(
      collapsedWorkspaceIdsAtom,
      ensureWorkspaceExpanded(get(collapsedWorkspaceIdsAtom), workspace.id),
    );

    return {
      workspace,
      didSwitchProject: previousId !== workspace.id,
    };
  },
);

// Drops a workspace from the in-memory store. If the removed workspace was
// active, fall back to the next available one (or null). Caller is expected
// to also purge any sessions tied to the workspace from sessionsAtom — the
// backend has already cascaded the delete in the DB.
export const removeWorkspaceAtom = atom(
  null,
  (get, set, workspaceId: string) => {
    const current = get(workspacesAtom);
    const next = current.filter((w) => w.id !== workspaceId);
    set(workspacesAtom, next);
    if (get(activeWorkspaceIdAtom) === workspaceId) {
      set(activeWorkspaceIdAtom, next[0]?.id ?? null);
    }
    if (get(lastSelectedWorkspaceIdAtom) === workspaceId) {
      set(lastSelectedWorkspaceIdAtom, next[0]?.id ?? null);
    }
  },
);
