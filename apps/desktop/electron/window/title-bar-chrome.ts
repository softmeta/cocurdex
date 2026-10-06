import type { BrowserWindowConstructorOptions } from "electron";

const TITLEBAR_HEIGHT = 32;
const LIGHT_SYMBOL_COLOR = "#e4e4e7";
const DARK_SYMBOL_COLOR = "#3f3f46";

export interface TitleBarOverlayStyle {
  color: string;
  symbolColor: string;
  height: number;
}

function relativeLuminance(hexColor: string): number {
  const hex = hexColor.replace("#", "");
  const channels = [0, 2, 4].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function titleBarOverlayFor(surfaceColor: string): TitleBarOverlayStyle {
  const isDarkSurface = relativeLuminance(surfaceColor) < 0.4;
  return {
    color: surfaceColor,
    symbolColor: isDarkSurface ? LIGHT_SYMBOL_COLOR : DARK_SYMBOL_COLOR,
    height: TITLEBAR_HEIGHT,
  };
}

export function hasTitleBarOverlay(platform: NodeJS.Platform): boolean {
  return platform !== "darwin";
}

export function titleBarChromeOptions(
  platform: NodeJS.Platform,
  surfaceColor: string,
): Pick<
  BrowserWindowConstructorOptions,
  "titleBarStyle" | "titleBarOverlay" | "trafficLightPosition"
> {
  if (!hasTitleBarOverlay(platform)) {
    return {
      titleBarStyle: "hidden",
      trafficLightPosition: { x: 12, y: 9 },
    };
  }
  return {
    titleBarStyle: "hidden",
    titleBarOverlay: titleBarOverlayFor(surfaceColor),
  };
}
