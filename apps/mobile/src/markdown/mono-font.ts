import { Platform } from "react-native";

export const MONO_FONT = Platform.select({
  ios: "Menlo",
  default: "monospace",
});
