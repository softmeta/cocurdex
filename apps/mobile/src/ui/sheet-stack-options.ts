import { Platform } from "react-native";
import { useGroupedColors } from "@/theme";
import { useHeaderOptions } from "./header-options";

const PUSH_ANIMATION =
  Platform.OS === "android" ? "slide_from_right" : "default";

export function useSheetStackOptions() {
  const grouped = useGroupedColors();
  return {
    ...useHeaderOptions(),
    animation: PUSH_ANIMATION,
    headerStyle: { backgroundColor: grouped.page },
    contentStyle: { backgroundColor: grouped.page },
  } as const;
}
