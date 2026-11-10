import type { BrowserWindowConstructorOptions } from "electron";

export type WindowMaterial = "vibrancy" | "mica";

export const WINDOW_MATERIAL_ARGUMENT = "--cocurdex-window-material";

const TRANSPARENT = "#00000000";
// DWM system backdrops (DWMWA_SYSTEMBACKDROP_TYPE) need Windows 11 22H2,
// build 22621: https://learn.microsoft.com/windows/win32/api/dwmapi/ne-dwmapi-dwm_systembackdrop_type
const MIN_WINDOWS_BACKDROP_BUILD = 22621;

function windowsBuild(systemVersion: string): number {
  const build = Number.parseInt(systemVersion.split(".")[2] ?? "", 10);
  return Number.isFinite(build) ? build : 0;
}

export function windowMaterialFor(
  platform: NodeJS.Platform,
  systemVersion: string,
): WindowMaterial | null {
  if (platform === "darwin") return "vibrancy";
  if (
    platform === "win32" &&
    windowsBuild(systemVersion) >= MIN_WINDOWS_BACKDROP_BUILD
  ) {
    return "mica";
  }
  return null;
}

export function windowMaterialOptions(
  material: WindowMaterial | null,
): Pick<
  BrowserWindowConstructorOptions,
  "backgroundColor" | "backgroundMaterial" | "vibrancy"
> {
  if (material === "vibrancy") {
    return { backgroundColor: TRANSPARENT, vibrancy: "sidebar" };
  }
  if (material === "mica") {
    return { backgroundColor: TRANSPARENT, backgroundMaterial: "mica" };
  }
  return {};
}
