import { spawn } from "node:child_process";
import { access, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Flag the desktop main process recognizes for CLI folder open. */
export const OPEN_FOLDER_FLAG = "--open-folder";

const KNOWN_COMMANDS = new Set([
  "init",
  "issue",
  "skills",
  "skill",
  "daemon",
  "workspace",
  "session",
  "provider",
  "workflow",
  "open",
  "help",
  "version",
]);

export function isKnownCliCommand(resource: string | undefined): boolean {
  return resource !== undefined && KNOWN_COMMANDS.has(resource);
}

/**
 * True when argv should open the desktop app (optionally with a folder)
 * instead of a subcommand. Matches VS Code-style `code .` / `code`.
 */
export function shouldHandleAsOpen(resource: string | undefined): boolean {
  return (
    resource === undefined ||
    resource === "open" ||
    !isKnownCliCommand(resource)
  );
}

/**
 * Resolve the folder path from CLI args.
 * - `cocurdex` → undefined (open app only)
 * - `cocurdex open` → undefined
 * - `cocurdex open .` / `cocurdex .` → path string
 */
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

/**
 * Launch (or signal) the Cocurdex desktop app, optionally opening a folder.
 * Detaches so the CLI can exit immediately, like `code .`.
 */
export async function openDesktopApp(folderPath?: string): Promise<void> {
  const { binary, args } = await resolveLaunch(folderPath);
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;

  const child = spawn(binary, args, {
    detached: true,
    stdio: "ignore",
    env,
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
    // Single-token form survives packaged second-instance argv reshuffling better
    // than a separate flag + value pair on some platforms.
    args.push(`${OPEN_FOLDER_FLAG}=${folderPath}`);
  }

  return { binary, args };
}

export function isPackagedAppBinary(execPath: string): boolean {
  // Normalize separators so Windows paths compare correctly on macOS/Linux hosts.
  const normalized = execPath.replace(/\\/g, "/").toLowerCase();
  if (normalized.includes("/node_modules/electron/")) {
    return false;
  }

  const base = normalized.split("/").filter(Boolean).pop() ?? "";
  if (base === "electron" || base === "electron.exe") {
    return false;
  }

  // Packaged product: Cocurdex / Cocurdex.exe (and case variants).
  return base === "cocurdex" || base === "cocurdex.exe";
}

async function resolveElectronBinary(): Promise<string> {
  const fromEnv = process.env.COCURDEX_ELECTRON;
  if (fromEnv) {
    await access(fromEnv);
    return fromEnv;
  }

  // Packaged / Electron-as-Node CLI: execPath is the app or Electron binary.
  if (process.versions.electron) {
    return process.execPath;
  }

  const candidates = await listElectronCandidates();
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // try next
    }
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

  // Packaged macOS install next to a user-local CLI symlink is handled via
  // process.versions.electron when the launcher uses Electron-as-Node.
  if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Cocurdex.app/Contents/MacOS/Cocurdex",
      path.join(
        process.env.HOME ?? "",
        "Applications/Cocurdex.app/Contents/MacOS/Cocurdex",
      ),
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

/** Walk up from this file looking for the monorepo workspace marker. */
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
