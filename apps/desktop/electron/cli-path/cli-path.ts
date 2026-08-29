import { execFile } from "node:child_process";
import {
  access,
  lstat,
  mkdir,
  readFile,
  readlink,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const CLI_COMMAND_NAME = "cocurdex";

export type CliPathStatus = {
  /** Bundled launcher exists and can be installed. */
  available: boolean;
  /** A command named cocurdex exists at the install path. */
  installed: boolean;
  /** Install path points at this app's bundled launcher. */
  pointsToCurrentApp: boolean;
  /** Directory used for user-local CLI installs. */
  binDir: string;
  /** Full path where the command is / will be installed. */
  installPath: string;
  /** Absolute path to the bundled launcher, or null if missing. */
  sourcePath: string | null;
  /** Whether binDir appears in the current process PATH. */
  binDirOnPath: boolean;
  /** Shell hint when binDir is not on PATH. */
  pathHint: string | null;
  error: string | null;
};

export type CliPathPlatform = "darwin" | "linux" | "win32" | string;

export function getCliLauncherFileName(platform: CliPathPlatform): string {
  return platform === "win32" ? `${CLI_COMMAND_NAME}.cmd` : CLI_COMMAND_NAME;
}

export function getCliInstallBinDir(
  platform: CliPathPlatform,
  home = homedir(),
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (platform === "win32") {
    const localAppData =
      env.LOCALAPPDATA ?? path.join(home, "AppData", "Local");
    return path.join(localAppData, "Cocurdex", "bin");
  }

  return path.join(home, ".local", "bin");
}

export function getCliInstallPath(
  platform: CliPathPlatform,
  home = homedir(),
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(
    getCliInstallBinDir(platform, home, env),
    getCliLauncherFileName(platform),
  );
}

export function isBinDirOnPath(
  binDir: string,
  pathEnv: string | undefined,
  platform: CliPathPlatform,
): boolean {
  if (!pathEnv) {
    return false;
  }

  const separator = platform === "win32" ? ";" : ":";
  const normalizedBin = normalizePathForCompare(binDir, platform);
  return pathEnv.split(separator).some((entry) => {
    if (!entry) {
      return false;
    }
    return normalizePathForCompare(entry, platform) === normalizedBin;
  });
}

export function buildPathHint(
  binDir: string,
  platform: CliPathPlatform,
): string {
  if (platform === "win32") {
    return `Add "${binDir}" to your user PATH, then open a new terminal.`;
  }

  return `Add this line to your shell profile (~/.zprofile or ~/.zshrc):\nexport PATH="${binDir}:$PATH"`;
}

/**
 * Resolve the bundled launcher path.
 * Packaged: process.resourcesPath/cli/<launcher>
 * Dev: <desktopRoot>/resources/cli/<launcher>
 */
export function resolveBundledCliLauncherPath(options: {
  platform: CliPathPlatform;
  isPackaged: boolean;
  resourcesPath: string;
  desktopRoot: string;
}): string {
  const fileName = getCliLauncherFileName(options.platform);
  if (options.isPackaged) {
    return path.join(options.resourcesPath, "cli", fileName);
  }
  return path.join(options.desktopRoot, "resources", "cli", fileName);
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function resolveSymlinkTarget(
  linkPath: string,
): Promise<string | null> {
  try {
    const stats = await lstat(linkPath);
    if (!stats.isSymbolicLink()) {
      return null;
    }
    const target = await readlink(linkPath);
    return path.isAbsolute(target)
      ? path.normalize(target)
      : path.normalize(path.resolve(path.dirname(linkPath), target));
  } catch {
    return null;
  }
}

export async function readCliPathStatus(options: {
  platform: CliPathPlatform;
  sourcePath: string | null;
  pathEnv?: string;
  home?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<CliPathStatus> {
  const home = options.home ?? homedir();
  const env = options.env ?? process.env;
  const binDir = getCliInstallBinDir(options.platform, home, env);
  const installPath = getCliInstallPath(options.platform, home, env);
  const sourcePath = options.sourcePath;
  const available = sourcePath !== null && (await pathExists(sourcePath));
  const installed = await pathExists(installPath);

  let pointsToCurrentApp = false;
  if (installed && available && sourcePath) {
    if (options.platform === "win32") {
      pointsToCurrentApp = await windowsInstallPointsToSource(
        installPath,
        sourcePath,
      );
    } else {
      const linkTarget = await resolveSymlinkTarget(installPath);
      pointsToCurrentApp =
        linkTarget !== null &&
        normalizePathForCompare(linkTarget, options.platform) ===
          normalizePathForCompare(sourcePath, options.platform);
    }
  }

  const binDirOnPath = isBinDirOnPath(
    binDir,
    options.pathEnv ?? env.PATH ?? env.Path,
    options.platform,
  );

  return {
    available,
    installed,
    pointsToCurrentApp,
    binDir,
    installPath,
    sourcePath,
    binDirOnPath,
    pathHint: binDirOnPath ? null : buildPathHint(binDir, options.platform),
    error: available
      ? null
      : "Bundled cocurdex CLI is missing. Rebuild the desktop package (prepare:cli).",
  };
}

export async function installCliOnPath(options: {
  platform: CliPathPlatform;
  sourcePath: string;
  home?: string;
  env?: NodeJS.ProcessEnv;
  ensureWindowsUserPath?: (binDir: string) => Promise<void>;
}): Promise<CliPathStatus> {
  const home = options.home ?? homedir();
  const env = options.env ?? process.env;
  const binDir = getCliInstallBinDir(options.platform, home, env);
  const installPath = getCliInstallPath(options.platform, home, env);

  if (!(await pathExists(options.sourcePath))) {
    return readCliPathStatus({
      platform: options.platform,
      sourcePath: options.sourcePath,
      home,
      env,
    });
  }

  await mkdir(binDir, { recursive: true });
  await removePathIfPresent(installPath);

  if (options.platform === "win32") {
    // Small shim so updates to the app path only require reinstall when the
    // install location moves; the shim calls the absolute packaged launcher.
    const shim = `@echo off\r\n"${options.sourcePath}" %*\r\n`;
    const tempPath = `${installPath}.${process.pid}.tmp`;
    await writeFile(tempPath, shim, "utf8");
    await rename(tempPath, installPath);
    const ensurePath =
      options.ensureWindowsUserPath ?? ensureWindowsUserPathContains;
    await ensurePath(binDir);
  } else {
    await symlink(options.sourcePath, installPath);
  }

  return readCliPathStatus({
    platform: options.platform,
    sourcePath: options.sourcePath,
    home,
    env,
  });
}

export async function uninstallCliFromPath(options: {
  platform: CliPathPlatform;
  sourcePath: string | null;
  home?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<CliPathStatus> {
  const home = options.home ?? homedir();
  const env = options.env ?? process.env;
  const installPath = getCliInstallPath(options.platform, home, env);

  // Only remove our install: correct symlink, or a shim we wrote on Windows.
  if (await pathExists(installPath)) {
    if (options.platform === "win32") {
      if (
        options.sourcePath &&
        (await windowsInstallPointsToSource(installPath, options.sourcePath))
      ) {
        await removePathIfPresent(installPath);
      }
    } else if (options.sourcePath) {
      const linkTarget = await resolveSymlinkTarget(installPath);
      if (
        linkTarget &&
        normalizePathForCompare(linkTarget, options.platform) ===
          normalizePathForCompare(options.sourcePath, options.platform)
      ) {
        await removePathIfPresent(installPath);
      }
    }
  }

  return readCliPathStatus({
    platform: options.platform,
    sourcePath: options.sourcePath,
    home,
    env,
  });
}

export async function ensureWindowsUserPathContains(
  binDir: string,
): Promise<void> {
  if (process.platform !== "win32") {
    return;
  }

  // Use PowerShell so we don't hit setx's 1024-char truncation trap.
  const script = `
$bin = $env:COCURDEX_BIN_DIR
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($null -eq $userPath) { $userPath = '' }
$parts = @($userPath -split ';' | Where-Object { $_ -ne '' })
$normalized = $parts | ForEach-Object { $_.TrimEnd('\\').ToLowerInvariant() }
$target = $bin.TrimEnd('\\').ToLowerInvariant()
if ($normalized -contains $target) { exit 0 }
$next = if ($userPath -eq '') { $bin } else { $userPath.TrimEnd(';') + ';' + $bin }
[Environment]::SetEnvironmentVariable('Path', $next, 'User')
`;

  await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    {
      env: {
        ...process.env,
        COCURDEX_BIN_DIR: binDir,
      },
      windowsHide: true,
    },
  );
}

function normalizePathForCompare(
  value: string,
  platform: CliPathPlatform,
): string {
  const normalized = path.normalize(value);
  if (platform === "win32") {
    return normalized.replace(/[/\\]+$/, "").toLowerCase();
  }
  return normalized.replace(/\/+$/, "");
}

async function removePathIfPresent(targetPath: string): Promise<void> {
  try {
    await rm(targetPath, { force: true });
  } catch {
    // ignore
  }
}

async function windowsInstallPointsToSource(
  installPath: string,
  sourcePath: string,
): Promise<boolean> {
  try {
    const content = await readFile(installPath, "utf8");
    return content.includes(sourcePath);
  } catch {
    return false;
  }
}
