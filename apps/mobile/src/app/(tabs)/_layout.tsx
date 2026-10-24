import { NativeTabs } from "expo-router/native-tabs";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import { useThemeColors } from "@/theme";

export default function TabsLayout() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  return (
    <NativeTabs
      tintColor={colors.tint}
      {...(Platform.OS === "android"
        ? {
            backgroundColor: colors.background,
            indicatorColor: colors.muted,
            rippleColor: colors.muted,
            iconColor: colors.foreground,
          }
        : {})}
    >
      <NativeTabs.Trigger name="(sessions)">
        <NativeTabs.Trigger.Icon
          sf={{
            default: "bubble.left.and.bubble.right",
            selected: "bubble.left.and.bubble.right.fill",
          }}
          md="forum"
        />
        <NativeTabs.Trigger.Label>
          {t("tabs.sessions")}
        </NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="computers">
        <NativeTabs.Trigger.Icon sf="laptopcomputer" md="computer" />
        <NativeTabs.Trigger.Label>
          {t("tabs.computers")}
        </NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
