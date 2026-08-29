// Map repo-relative git paths into Pierre tree paths that always sit under a
// single workspace-root folder, so the user can collapse the whole tree by
// clicking that top-level directory.

export function normalizeWorkspaceTreeRootName(name: string): string {
  const trimmed = name.replace(/[/\\]+$/g, "").trim();
  return trimmed.length > 0 ? trimmed : "workspace";
}

export function toGitTreePath(
  workspaceName: string,
  repoRelativePath: string,
): string {
  const root = normalizeWorkspaceTreeRootName(workspaceName);
  return `${root}/${repoRelativePath}`;
}

// Strip the workspace-root prefix. Returns null when the path is not under it
// (including the root directory row itself when callers pass a bare root).
export function fromGitTreePath(
  workspaceName: string,
  treePath: string,
): string | null {
  const root = normalizeWorkspaceTreeRootName(workspaceName);
  const prefix = `${root}/`;
  if (!treePath.startsWith(prefix)) {
    return null;
  }
  const relative = treePath.slice(prefix.length);
  return relative.length > 0 ? relative : null;
}
