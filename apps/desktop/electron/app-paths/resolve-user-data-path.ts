import { COCURDEX_USER_DATA_PATH_ENV } from "@cocurdex/daemon/paths";

export function resolveUserDataPath(
  defaultUserDataPath: string,
  isPackaged: boolean,
): string {
  const configured = process.env[COCURDEX_USER_DATA_PATH_ENV]?.trim();
  if (configured) {
    return configured;
  }
  if (isPackaged) {
    return defaultUserDataPath;
  }
  return `${defaultUserDataPath}-dev`;
}
