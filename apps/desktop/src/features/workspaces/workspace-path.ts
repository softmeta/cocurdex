// Collapse the macOS home prefix so long absolute paths read compactly.
export function compactWorkspacePath(path: string) {
  return path.replace(/^\/Users\/[^/]+/, "~");
}
