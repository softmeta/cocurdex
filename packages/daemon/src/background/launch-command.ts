import { APP_LAUNCH_COMMAND_ENV } from "./launch-args";

interface LaunchCommandSource {
  env: NodeJS.ProcessEnv;
  execPath: string;
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

export function resolveAppLaunchCommand({
  env,
  execPath,
  electronVersion,
}: LaunchCommandSource): string[] | null {
  const configured = env[APP_LAUNCH_COMMAND_ENV];
  if (configured) return parseLaunchCommand(configured);
  if (!electronVersion) return null;
  return [env.APPIMAGE || execPath];
}
