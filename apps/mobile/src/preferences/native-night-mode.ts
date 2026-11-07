import { requireOptionalNativeModule } from "expo";
import type { AppearancePreference } from "./preferences";

interface NativeNightMode {
  setApplicationNightMode(appearance: AppearancePreference): void;
}

const native =
  requireOptionalNativeModule<NativeNightMode>("CocurdexNightMode");

export function persistNightMode(appearance: AppearancePreference) {
  native?.setApplicationNightMode(appearance);
}
