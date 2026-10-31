import { Platform } from "react-native";
import { useThemeColors } from "@/theme";
import { HeaderBackButton } from "./header-back-button";

function backButton({ canGoBack }: { canGoBack?: boolean }) {
  return canGoBack ? <HeaderBackButton /> : null;
}

const ANDROID_BACK =
  Platform.OS === "android"
    ? { headerBackVisible: false, headerLeft: backButton }
    : {};

export function useHeaderOptions() {
  const colors = useThemeColors();
  return {
    headerTitleAlign: "center",
    headerTintColor: colors.foreground,
    headerTitleStyle: { fontSize: 17, fontWeight: "600" },
    headerShadowVisible: false,
    headerBackButtonDisplayMode: "minimal",
    ...ANDROID_BACK,
  } as const;
}
