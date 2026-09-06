export function resolveDefaultShell(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): string {
  if (platform === "win32") {
    return env.COMSPEC ?? "powershell.exe";
  }
  if (env.SHELL) {
    return env.SHELL;
  }
  if (platform === "darwin") {
    return "/bin/zsh";
  }
  return "/bin/bash";
}
