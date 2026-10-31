import "@/runtime";
import "@/i18n";
import { pathBaseName } from "@cocurdex/shared";
import { NavigationBar } from "expo-navigation-bar";
import { Stack, ThemeProvider } from "expo-router";
import { useTranslation } from "react-i18next";
import { Platform, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { MermaidRendererHost } from "@/markdown";
import {
  navigationThemes,
  themeColors,
  useGroupedColors,
  useThemeColors,
  useThemeName,
} from "@/theme";
import { useHeaderOptions } from "@/ui";

const PAIR_PRESENTATION = Platform.OS === "ios" ? "formSheet" : "modal";
const PUSH_ANIMATION =
  Platform.OS === "android" ? "slide_from_right" : "default";
const SHEET_CORNER_RADIUS = Platform.OS === "android" ? 28 : -1;
const SHEET_PRESENTATION = {
  headerShown: false,
  presentation: "formSheet",
  sheetGrabberVisible: true,
  sheetCornerRadius: SHEET_CORNER_RADIUS,
} as const;
const SHEET_TALL = {
  ...SHEET_PRESENTATION,
  sheetAllowedDetents: [0.75, 1],
};
const SHEET_MEDIUM = {
  ...SHEET_PRESENTATION,
  sheetAllowedDetents: [0.6, 1],
};
const VIEWER_ANIMATION = Platform.OS === "android" ? "fade" : "default";

function fileScreenTitle(params: object | undefined) {
  const path = params && "path" in params ? params.path : undefined;
  return typeof path === "string" ? pathBaseName(path) : "";
}

export default function RootLayout() {
  const { t } = useTranslation();
  const scheme = useThemeName();
  const colors = useThemeColors();
  const grouped = useGroupedColors();
  const headerOptions = useHeaderOptions();
  const systemBarStyle = scheme === "dark" ? "light" : "dark";
  return (
    <GestureHandlerRootView
      style={[styles.root, { backgroundColor: colors.background }]}
    >
      <ThemeProvider value={navigationThemes[scheme]}>
        <Stack
          screenOptions={{
            ...headerOptions,
            statusBarStyle: systemBarStyle,
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="session/[hostId]/[sessionId]"
            options={{
              title: "",
              headerBackTitle: t("tabs.sessions"),
              animation: PUSH_ANIMATION,
              contentStyle: { backgroundColor: colors.background },
            }}
          />
          <Stack.Screen
            name="note/[hostId]/[noteId]"
            options={{
              title: "",
              headerBackTitle: t("tabs.notes"),
              animation: PUSH_ANIMATION,
              contentStyle: { backgroundColor: colors.background },
            }}
          />
          <Stack.Screen
            name="issue/[hostId]/[issueId]"
            options={{
              title: "",
              headerBackTitle: t("tabs.issues"),
              animation: PUSH_ANIMATION,
              headerStyle: { backgroundColor: grouped.page },
              contentStyle: { backgroundColor: grouped.page },
            }}
          />
          <Stack.Screen
            name="computers"
            options={{
              title: t("screens.computers"),
              headerBackTitle: t("tabs.settings"),
              animation: PUSH_ANIMATION,
              contentStyle: { backgroundColor: colors.background },
            }}
          />
          <Stack.Screen
            name="computer/[hostId]"
            options={{
              title: "",
              animation: PUSH_ANIMATION,
              headerStyle: { backgroundColor: grouped.page },
              contentStyle: { backgroundColor: grouped.page },
            }}
          />
          <Stack.Screen
            name="archived/[hostId]"
            options={{
              title: t("screens.archived"),
              animation: PUSH_ANIMATION,
              contentStyle: { backgroundColor: colors.background },
            }}
          />
          <Stack.Screen
            name="tool-call/[hostId]/[sessionId]/[toolCallId]"
            options={{
              title: "",
              animation: PUSH_ANIMATION,
              contentStyle: { backgroundColor: colors.background },
            }}
          />
          <Stack.Screen
            name="file/[hostId]"
            options={({ route }) => ({
              title: fileScreenTitle(route.params),
              animation: PUSH_ANIMATION,
              contentStyle: { backgroundColor: colors.background },
            })}
          />
          <Stack.Screen
            name="image/[hostId]/index"
            options={{
              title: "",
              presentation: "fullScreenModal",
              animation: VIEWER_ANIMATION,
              headerTransparent: true,
              headerTintColor: themeColors.dark.foreground,
              statusBarStyle: "light",
              contentStyle: { backgroundColor: themeColors.dark.background },
            }}
          />
          <Stack.Screen
            name="diagram/[diagramId]"
            options={{
              title: "",
              presentation: "fullScreenModal",
              animation: VIEWER_ANIMATION,
              headerTransparent: true,
              contentStyle: { backgroundColor: colors.background },
            }}
          />
          <Stack.Screen
            name="pair"
            options={{
              title: t("screens.pair"),
              presentation: PAIR_PRESENTATION,
              sheetAllowedDetents: [0.6, 1],
              sheetGrabberVisible: true,
              sheetCornerRadius: SHEET_CORNER_RADIUS,
            }}
          />
          <Stack.Screen
            name="list-options"
            options={{
              ...SHEET_TALL,
            }}
          />
          <Stack.Screen
            name="issue-filters"
            options={{
              ...SHEET_MEDIUM,
            }}
          />
          <Stack.Screen
            name="issue-labels"
            options={{
              ...SHEET_MEDIUM,
            }}
          />
          <Stack.Screen name="options" options={SHEET_MEDIUM} />
          <Stack.Screen
            name="edit-issue/[hostId]/[issueId]"
            options={{
              title: t("screens.editIssue"),
              presentation: "modal",
              headerStyle: { backgroundColor: colors.background },
              contentStyle: { backgroundColor: colors.background },
            }}
          />
          <Stack.Screen
            name="session-config/[hostId]/[sessionId]"
            options={{
              ...SHEET_TALL,
            }}
          />
          <Stack.Screen
            name="new-session/index"
            options={{
              title: "",
              headerBackTitle: t("tabs.sessions"),
              animation: PUSH_ANIMATION,
              contentStyle: { backgroundColor: colors.background },
            }}
          />
          <Stack.Screen
            name="new-session/config"
            options={{
              ...SHEET_TALL,
            }}
          />
          <Stack.Screen
            name="new-issue/[hostId]"
            options={{
              title: t("screens.newIssue"),
              presentation: "modal",
              headerStyle: { backgroundColor: colors.background },
              contentStyle: { backgroundColor: colors.background },
            }}
          />
          <Stack.Screen
            name="rename-session/[hostId]/[sessionId]"
            options={{
              title: t("screens.renameSession"),
              presentation: "modal",
              headerStyle: { backgroundColor: grouped.page },
              contentStyle: { backgroundColor: grouped.page },
            }}
          />
          <Stack.Screen
            name="rename-computer/[hostId]"
            options={{
              title: t("screens.renameComputer"),
              presentation: "modal",
              headerStyle: { backgroundColor: grouped.page },
              contentStyle: { backgroundColor: grouped.page },
            }}
          />
          <Stack.Screen
            name="scan"
            options={{
              title: "",
              presentation: "fullScreenModal",
              headerTransparent: true,
              headerTintColor: themeColors.dark.foreground,
              statusBarStyle: "light",
            }}
          />
        </Stack>
        <NavigationBar style={systemBarStyle} />
        <MermaidRendererHost />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
