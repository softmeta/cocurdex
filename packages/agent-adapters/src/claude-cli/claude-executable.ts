import { existsSync } from "node:fs";
import path from "node:path";

// Windows launcher scripts that Node cannot spawn without a shell
// (`spawn EINVAL` since Node 20.12).
const WINDOWS_SHIM_EXTENSIONS = new Set([".cmd", ".bat", ".ps1"]);

// Entry points of the npm `@anthropic-ai/claude-code` package relative to the
// global `node_modules` directory next to the npm launcher shim. Newer package
// versions ship a native `bin/claude.exe`; older ones only ship `cli.js`.
const NPM_PACKAGE_ENTRIES = [
  ["node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe"],
  ["node_modules", "@anthropic-ai", "claude-code", "cli.js"],
] as const;

/**
 * Resolves a discovered `claude` path into something the Claude Agent SDK can
 * spawn as `pathToClaudeCodeExecutable`. The SDK spawns the path directly
 * without a shell, so on Windows an npm `claude.cmd` shim fails with
 * `spawn EINVAL`; follow the shim to the real package entry next to it.
 */
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
