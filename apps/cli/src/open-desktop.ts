import { spawn } from "node:child_process";
import { access, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BACKGROUND_DAEMON_ARG } from "@cocurdex/daemon/background-launch";

export const OPEN_FOLDER_FLAG = "--open-folder";

function looksLikePath(value: string, platform: NodeJS.Platform) {
  const pathApi = platform === "win32" ? path.win32 : path.posix;
  return (
    value === "." ||
    value === ".." ||
    pathApi.isAbsolute(value) ||
    value.includes("/") ||
    (platform === "win32" && value.includes("\\"))
  );
}

export function shouldHandleAsOpen(
  resource: string | undefined,
  platform: NodeJS.Platform = process.platform,
): boolean {
  return (
    resource === undefined ||
    resource === "open" ||
    looksLikePath(resource, platform)
  );
}

export async function isExistingDirectory(folderPath: string) {
  try {
    return (await stat(path.resolve(folderPath))).isDirectory();
  } catch {
    return false;
  }
}

export function resolveOpenFolderArg(
  resource: string | undefined,
  action: string | undefined,
): string | undefined {
  if (resource === undefined) {
    return undefined;
  }
  if (resource === "open") {
    return action;
  }
  return resource;
}

export async function assertDirectory(folderPath: string): Promise<string> {
  const resolved = path.resolve(folderPath);
  let stats: Awaited<ReturnType<typeof stat>>;
  try {
    stats = await stat(resolved);
  } catch {
    throw new Error(`Path does not exist: ${resolved}`);
  }
  if (!stats.isDirectory()) {
    throw new Error(`Not a directory: ${resolved}`);
  }
  return resolved;
}

export async function openDesktopApp(folderPath?: string): Promise<void> {
  const { binary, args } = await resolveLaunch(folderPath);
  spawnDesktopApp(binary, args);
}

export async function launchBackgroundDaemon(): Promise<void> {
  const { binary, args } = await resolveLaunch();
  spawnDesktopApp(binary, [...args, BACKGROUND_DAEMON_ARG]);
}

function spawnDesktopApp(binary: string, args: string[]) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.COCURDEX_APPIMAGE;

  const child = spawn(binary, args, {
    detached: true,
    stdio: "ignore",
    env,
    windowsHide: true,
  });
  child.unref();
}

export async function resolveLaunch(folderPath?: string): Promise<{
  binary: string;
  args: string[];
}> {
  const binary = await resolveElectronBinary();
  const args: string[] = [];

  if (!isPackagedAppBinary(binary)) {
    const appPath = await resolveDesktopAppPath();
    if (!appPath) {
      throw new Error(
        [
          "Could not locate the Cocurdex desktop app.",
          "Install Cocurdex and use Settings → CLI, or set COCURDEX_ELECTRON to the app binary.",
        ].join(" "),
      );
    }
    args.push(appPath);
  }

  if (folderPath) {
    args.push(`${OPEN_FOLDER_FLAG}=${folderPath}`);
  }

  return { binary, args };
}

export function isPackagedAppBinary(execPath: string): boolean {
  const normalized = execPath.replace(/\\/g, "/").toLowerCase();
  if (normalized.includes("/node_modules/electron/")) {
    return false;
  }

  const base = normalized.split("/").filter(Boolean).pop() ?? "";
  if (base === "electron" || base === "electron.exe") {
    return false;
  }

  return (
    base === "cocurdex" || base === "cocurdex.exe" || base.endsWith(".appimage")
  );
}

async function resolveElectronBinary(): Promise<string> {
  const fromEnv = process.env.COCURDEX_ELECTRON;
  if (fromEnv) {
    await access(fromEnv);
    return fromEnv;
  }

  const appImage = process.env.COCURDEX_APPIMAGE;
  if (appImage) {
    await access(appImage);
    return appImage;
  }

  if (process.versions.electron) {
    return process.execPath;
  }

  const candidates = await listElectronCandidates();
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {}
  }

  throw new Error(
    [
      "Could not locate the Electron/Cocurdex binary.",
      "Open the Cocurdex desktop app once (Settings → CLI installs the launcher),",
      "or set COCURDEX_ELECTRON.",
    ].join(" "),
  );
}

async function listElectronCandidates(): Promise<string[]> {
  const monorepoRoot = await findMonorepoRoot();
  const desktopRoot = monorepoRoot
    ? path.join(monorepoRoot, "apps", "desktop")
    : null;
  const candidates: string[] = [];

  if (desktopRoot) {
    if (process.platform === "darwin") {
      candidates.push(
        path.join(
          desktopRoot,
          "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
        ),
        path.join(
          monorepoRoot as string,
          "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
        ),
      );
    } else if (process.platform === "win32") {
      candidates.push(
        path.join(desktopRoot, "node_modules/electron/dist/electron.exe"),
        path.join(
          monorepoRoot as string,
          "node_modules/electron/dist/electron.exe",
        ),
      );
    } else {
      candidates.push(
        path.join(desktopRoot, "node_modules/electron/dist/electron"),
        path.join(
          monorepoRoot as string,
          "node_modules/electron/dist/electron",
        ),
      );
    }
  }

  if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Cocurdex.app/Contents/MacOS/Cocurdex",
      path.join(homedir(), "Applications/Cocurdex.app/Contents/MacOS/Cocurdex"),
    );
  }

  return candidates.filter(Boolean);
}

async function resolveDesktopAppPath(): Promise<string | null> {
  const monorepoRoot = await findMonorepoRoot();
  if (!monorepoRoot) {
    return null;
  }
  const desktopRoot = path.join(monorepoRoot, "apps", "desktop");
  try {
    await access(path.join(desktopRoot, "package.json"));
    return desktopRoot;
  } catch {
    return null;
  }
}

export async function findMonorepoRoot(): Promise<string | null> {
  let current = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

  for (let depth = 0; depth < 8; depth += 1) {
    try {
      await access(path.join(current, "pnpm-workspace.yaml"));
      return current;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) {
        return null;
      }
      current = parent;
    }
  }

  return null;
}
