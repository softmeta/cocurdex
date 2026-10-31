import type { SupportedLocale } from "@cocurdex/shared";

export type Appearance = "light" | "dark";

export type MobilePlatform = "ios" | "android";

export interface MobileTarget {
  deviceId: string;
  setAppearance(appearance: Appearance): Promise<void>;
  setLocale(locale: SupportedLocale): Promise<void>;
  resetState(): Promise<void>;
  launchApp(): Promise<void>;
  diagnostics(): Promise<string>;
  stop(): Promise<void>;
}
