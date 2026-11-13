import type { ErrorBoundaryProps } from "expo-router";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { useThemeColors } from "@/theme";
import { ListNotice } from "./list-parts";

export function RouteErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <ListNotice
        icon={{ ios: "exclamationmark.triangle", android: "error" }}
        title={t("routeError.title")}
        description={error.message}
        action={{ label: t("routeError.retry"), onPress: () => void retry() }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
