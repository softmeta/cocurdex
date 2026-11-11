import path from "node:path";
import { APP_LAUNCH_COMMAND_ENV, HEADLESS_DAEMON_ENTRY } from "./launch-args";

export type DaemonRuntime =
  | { kind: "app"; launchCommand: string[] }
  | { kind: "headless"; launchCommand: string[] }
  | { kind: "source" };

interface DaemonRuntimeSource {
  env: NodeJS.ProcessEnv;
  execPath: string;
  execArgv: readonly string[];
  scriptPath: string | undefined;
  electronVersion: string | undefined;
}

function parseLaunchCommand(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every((part) => typeof part === "string" && part.length > 0)
    ) {
      return parsed as string[];
    }
  } catch {
    return null;
  }
  return null;
}

export function resolveDaemonRuntime({
  env,
  execPath,
  execArgv,
  scriptPath,
  electronVersion,
}: DaemonRuntimeSource): DaemonRuntime {
  const configured = env[APP_LAUNCH_COMMAND_ENV];
  if (configured) {
    const launchCommand = parseLaunchCommand(configured);
    return launchCommand ? { kind: "app", launchCommand } : { kind: "source" };
  }
  if (electronVersion) {
    return { kind: "app", launchCommand: [env.APPIMAGE || execPath] };
  }
  if (scriptPath && path.basename(scriptPath) === HEADLESS_DAEMON_ENTRY) {
    return {
      kind: "headless",
      launchCommand: [execPath, ...execArgv, scriptPath],
    };
  }
  return { kind: "source" };
}

export function runtimeLaunchCommand(runtime: DaemonRuntime) {
  return runtime.kind === "source" ? null : runtime.launchCommand;
}
