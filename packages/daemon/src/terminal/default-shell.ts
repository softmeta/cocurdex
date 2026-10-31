import { existsSync } from "node:fs";
import path from "node:path";

function findOnWindowsPath(
  executable: string,
  env: NodeJS.ProcessEnv,
  fileExists: (filePath: string) => boolean,
): string | null {
  const pathValue = env.Path ?? env.PATH ?? "";
  for (const directory of pathValue.split(";")) {
    if (!directory) {
      continue;
    }
    const candidate = path.win32.join(directory, executable);
    if (fileExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function resolveDefaultShell(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  fileExists: (filePath: string) => boolean = existsSync,
): string {
  if (platform === "win32") {
    return (
      findOnWindowsPath("pwsh.exe", env, fileExists) ??
      findOnWindowsPath("powershell.exe", env, fileExists) ??
      env.ComSpec ??
      env.COMSPEC ??
      "powershell.exe"
    );
  }
  if (env.SHELL) {
    return env.SHELL;
  }
  if (platform === "darwin") {
    return "/bin/zsh";
  }
  return "/bin/bash";
}

export function defaultShellArgs(platform: NodeJS.Platform, shell: string) {
  if (platform !== "win32") {
    return ["-l"];
  }
  const executable = path.win32.basename(shell).toLowerCase();
  return executable === "pwsh.exe" || executable === "powershell.exe"
    ? ["-NoLogo"]
    : [];
}
