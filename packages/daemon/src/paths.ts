import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export const DATABASE_FILENAME = "cocurdex.sqlite";
export const DAEMON_METADATA_FILENAME = "daemon.json";
export const COCURDEX_USER_DATA_PATH_ENV = "COCURDEX_USER_DATA_PATH";

export function getDefaultUserDataPath() {
  if (process.platform === "darwin") {
    return path.join(homedir(), "Library", "Application Support", "Cocurdex");
  }

  if (process.platform === "win32") {
    return path.join(
      process.env.APPDATA ?? path.join(homedir(), "AppData", "Roaming"),
      "Cocurdex",
    );
  }

  return path.join(
    process.env.XDG_CONFIG_HOME ?? path.join(homedir(), ".config"),
    "cocurdex",
  );
}

export function getConfiguredUserDataPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configuredPath = env[COCURDEX_USER_DATA_PATH_ENV]?.trim();
  return configuredPath || getDefaultUserDataPath();
}

export function getDaemonSocketPath(
  userDataPath = getDefaultUserDataPath(),
  platform = process.platform,
) {
  if (platform === "win32") {
    const profileId = createHash("sha256")
      .update(path.resolve(userDataPath))
      .digest("hex")
      .slice(0, 16);
    return `\\\\.\\pipe\\cocurdex-daemon-${profileId}`;
  }

  return path.join(userDataPath, "daemon.sock");
}

export function getDaemonMetadataPath(userDataPath = getDefaultUserDataPath()) {
  return path.join(userDataPath, DAEMON_METADATA_FILENAME);
}

export function getDatabasePath(userDataPath = getDefaultUserDataPath()) {
  return path.join(userDataPath, DATABASE_FILENAME);
}

export function getWorktreeBasePath(
  userDataPath = getDefaultUserDataPath(),
  configuredRootPath?: string | null,
) {
  const configured = configuredRootPath?.trim();
  if (configured) {
    return path.resolve(configured);
  }
  return path.join(userDataPath, "worktrees");
}

export function hashRepoPath(value: string) {
  return createHash("sha256")
    .update(path.resolve(value))
    .digest("hex")
    .slice(0, 16);
}

export function createSessionWorktreePath(input: {
  repoRootPath: string;
  worktreeId: string;
  userDataPath?: string;
  worktreeRootPath?: string | null;
}) {
  return path.join(
    getWorktreeBasePath(input.userDataPath, input.worktreeRootPath),
    hashRepoPath(input.repoRootPath),
    input.worktreeId,
  );
}

function resolveExistingPath(value: string) {
  try {
    return realpathSync(value);
  } catch {
    return path.resolve(value);
  }
}

function isPathInsideBase(target: string, base: string) {
  return target === base || target.startsWith(`${base}${path.sep}`);
}

export function isAppManagedWorktreePath(
  worktreePath: string,
  userDataPath?: string,
  configuredRootPath?: string | null,
) {
  const target = resolveExistingPath(worktreePath);
  const bases = [resolveExistingPath(getWorktreeBasePath(userDataPath))];
  if (configuredRootPath?.trim()) {
    const configured = resolveExistingPath(configuredRootPath.trim());
    if (!bases.includes(configured)) {
      bases.push(configured);
    }
  }
  return bases.some((base) => isPathInsideBase(target, base));
}
