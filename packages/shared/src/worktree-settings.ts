export const WORKTREE_SETTING_KEY = "worktree";

export interface WorktreeSettings {
  fetchBeforeCreate: boolean;
  rootPath: string | null;
}

export interface WorktreeSettingsSnapshot extends WorktreeSettings {
  resolvedRootPath: string;
}

export interface ManagedWorktreeSession {
  archived: boolean;
  id: string;
  title: string;
}

export interface ManagedWorktree {
  branch: string | null;
  detached: boolean;
  head: string;
  path: string;
  sessions: ManagedWorktreeSession[];
  workspaceId: string;
  workspaceName: string;
  workspaceRootPath: string;
}

export interface ManagedWorktreeGroup {
  workspaceId: string;
  workspaceName: string;
  workspaceRootPath: string;
  worktrees: ManagedWorktree[];
}

export const DEFAULT_WORKTREE_SETTINGS: WorktreeSettings = {
  fetchBeforeCreate: false,
  rootPath: null,
};

function isAsciiLetter(char: string | undefined) {
  if (!char) {
    return false;
  }
  const code = char.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isAbsoluteFilesystemPath(value: string) {
  if (value.startsWith("/")) {
    return true;
  }
  return (
    value.length >= 3 &&
    isAsciiLetter(value[0]) &&
    value[1] === ":" &&
    (value[2] === "/" || value[2] === "\\")
  );
}

function isWindowsDriveRoot(value: string) {
  if (value.length < 2 || value.length > 3 || value[1] !== ":") {
    return false;
  }
  if (!isAsciiLetter(value[0])) {
    return false;
  }
  if (value.length === 2) {
    return true;
  }
  const sep = value[2];
  return sep === "/" || sep === "\\";
}

function stripTrailingPathSeparators(value: string) {
  let end = value.length;
  while (end > 0) {
    const char = value[end - 1];
    if (char !== "/" && char !== "\\") {
      break;
    }
    end -= 1;
  }
  return value.slice(0, end);
}

export function normalizeWorktreeSettings(input: {
  fetchBeforeCreate?: boolean;
  rootPath?: string | null;
}): WorktreeSettings {
  const rootPath = input.rootPath?.trim() || null;
  return {
    fetchBeforeCreate: Boolean(input.fetchBeforeCreate),
    rootPath: rootPath && isAbsoluteFilesystemPath(rootPath) ? rootPath : null,
  };
}

export function parseWorktreeSettings(raw: string | null): WorktreeSettings {
  if (!raw) {
    return { ...DEFAULT_WORKTREE_SETTINGS };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ...DEFAULT_WORKTREE_SETTINGS };
    }
    const record = parsed as {
      fetchBeforeCreate?: unknown;
      rootPath?: unknown;
    };
    return normalizeWorktreeSettings({
      fetchBeforeCreate:
        typeof record.fetchBeforeCreate === "boolean"
          ? record.fetchBeforeCreate
          : false,
      rootPath: typeof record.rootPath === "string" ? record.rootPath : null,
    });
  } catch {
    return { ...DEFAULT_WORKTREE_SETTINGS };
  }
}

export function serializeWorktreeSettings(settings: WorktreeSettings): string {
  return JSON.stringify(normalizeWorktreeSettings(settings));
}

export function normalizeWorktreePath(value: string) {
  const trimmed = value.trim();
  const stripped = stripTrailingPathSeparators(trimmed);
  if (trimmed === "/" || isWindowsDriveRoot(trimmed)) {
    return stripped || trimmed;
  }
  return stripped;
}

export function worktreePathsEqual(left: string, right: string) {
  return normalizeWorktreePath(left) === normalizeWorktreePath(right);
}

export function sessionsUsingWorktreePath(
  sessions: readonly {
    archivedAt?: string | null;
    id: string;
    title: string;
    worktreePath?: string | null;
  }[],
  worktreePath: string,
): ManagedWorktreeSession[] {
  return sessions.flatMap((session) => {
    const boundPath = session.worktreePath?.trim();
    if (!boundPath || !worktreePathsEqual(boundPath, worktreePath)) {
      return [];
    }
    return [
      {
        archived: Boolean(session.archivedAt),
        id: session.id,
        title: session.title,
      },
    ];
  });
}

export function groupManagedWorktrees(
  worktrees: readonly ManagedWorktree[],
): ManagedWorktreeGroup[] {
  const groups: ManagedWorktreeGroup[] = [];
  const indexByWorkspace = new Map<string, number>();

  for (const worktree of worktrees) {
    const existing = indexByWorkspace.get(worktree.workspaceId);
    if (existing === undefined) {
      indexByWorkspace.set(worktree.workspaceId, groups.length);
      groups.push({
        workspaceId: worktree.workspaceId,
        workspaceName: worktree.workspaceName,
        workspaceRootPath: worktree.workspaceRootPath,
        worktrees: [worktree],
      });
      continue;
    }
    groups[existing]?.worktrees.push(worktree);
  }

  return groups;
}
