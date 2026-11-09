export function compactWorkspacePath(path: string) {
  return path.replace(/^\/Users\/[^/]+/, "~");
}

export function splitWorkspacePath(path: string) {
  const trimmed = path.replace(/[\\/]+$/, "");
  const separatorIndex = Math.max(
    trimmed.lastIndexOf("/"),
    trimmed.lastIndexOf("\\"),
  );
  if (separatorIndex < 0) {
    return { name: trimmed, parent: "" };
  }
  return {
    name: trimmed.slice(separatorIndex + 1),
    parent: compactWorkspacePath(trimmed.slice(0, separatorIndex + 1)),
  };
}
