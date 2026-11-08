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
