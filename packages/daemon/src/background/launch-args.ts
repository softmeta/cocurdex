export const BACKGROUND_DAEMON_ARG = "--background-daemon";
export const BACKGROUND_USER_DATA_ARG = "--background-daemon-user-data";
export const APP_LAUNCH_COMMAND_ENV = "COCURDEX_APP_LAUNCH_COMMAND";

export interface BackgroundLaunch {
  userDataPath: string | null;
}

export function parseBackgroundLaunch(
  argv: readonly string[],
): BackgroundLaunch | null {
  if (!argv.includes(BACKGROUND_DAEMON_ARG)) return null;
  const prefix = `${BACKGROUND_USER_DATA_ARG}=`;
  const userDataArg = argv.find((arg) => arg.startsWith(prefix));
  const userDataPath = userDataArg?.slice(prefix.length).trim();
  return { userDataPath: userDataPath || null };
}
