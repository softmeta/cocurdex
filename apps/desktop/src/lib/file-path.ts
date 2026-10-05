const WINDOWS_ABSOLUTE_PATH = /^[A-Za-z]:[\\/]/;

export function toAbsolutePath(
  path: string,
  rootPath: string | null,
): string | null {
  if (path.startsWith("/") || WINDOWS_ABSOLUTE_PATH.test(path)) {
    return path;
  }
  if (!rootPath) {
    return null;
  }
  return `${rootPath}/${path}`;
}
