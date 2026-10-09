const WINDOWS_DRIVE_PATH = /^[A-Za-z]:[\\/]/;

function isWindowsPath(path: string) {
  return WINDOWS_DRIVE_PATH.test(path) || path.startsWith("\\\\");
}

function toComparablePath(path: string, windows: boolean) {
  const trimmed = path.trim().replace(/[\\/]+$/, "");
  return windows ? trimmed.replaceAll("\\", "/").toLowerCase() : trimmed;
}

export function getWorkspaceRelativePath(
  filePath: string,
  workspacePath: string | null,
): string | null {
  if (!workspacePath) {
    return null;
  }
  const windows = isWindowsPath(workspacePath);
  const root = toComparablePath(workspacePath, windows);
  const target = toComparablePath(filePath, windows);
  if (target === root) {
    return root ? "" : null;
  }
  if (!root || !target.startsWith(`${root}/`)) {
    return null;
  }
  const relative = filePath.trim().slice(root.length + 1);
  return windows ? relative.replaceAll("\\", "/") : relative;
}

export function getDisplayDirectory(
  filePath: string,
  workspacePath: string | null,
): string | null {
  const separatorIndex = Math.max(
    filePath.lastIndexOf("/"),
    filePath.lastIndexOf("\\"),
  );
  const directory = filePath.slice(0, Math.max(separatorIndex, 0));
  const relative = getWorkspaceRelativePath(directory, workspacePath);
  if (relative === null) {
    return directory || null;
  }
  return relative || null;
}

const LEADING_CD =
  /^cd\s+(?:\/d\s+)?(?:"([^"]+)"|'([^']+)'|([^\s;&|"']+))\s*&&\s*/i;

export function withoutWorkspaceCd(
  command: string,
  workspacePath: string | null,
) {
  const match = LEADING_CD.exec(command);
  const target = match?.[1] ?? match?.[2] ?? match?.[3];
  if (!match || !target || !workspacePath) {
    return command;
  }
  const rest = command.slice(match[0].length).trim();
  if (!rest || getWorkspaceRelativePath(target, workspacePath) !== "") {
    return command;
  }
  return rest;
}
