import { existsSync } from "node:fs";
import path from "node:path";

const WINDOWS_SHIM_EXTENSIONS = new Set([".cmd", ".bat", ".ps1"]);

const NPM_PACKAGE_ENTRIES = [
  ["node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe"],
  ["node_modules", "@anthropic-ai", "claude-code", "cli.js"],
] as const;

export function resolveClaudeSdkExecutablePath(
  binaryPath: string,
  platform: NodeJS.Platform = process.platform,
  fileExists: (filePath: string) => boolean = existsSync,
) {
  if (platform !== "win32") {
    return binaryPath;
  }

  const extension = path.win32.extname(binaryPath).toLowerCase();
  if (!WINDOWS_SHIM_EXTENSIONS.has(extension)) {
    return binaryPath;
  }

  const shimDirectory = path.win32.dirname(binaryPath);
  for (const segments of NPM_PACKAGE_ENTRIES) {
    const candidate = path.win32.join(shimDirectory, ...segments);
    if (fileExists(candidate)) {
      return candidate;
    }
  }

  return binaryPath;
}
