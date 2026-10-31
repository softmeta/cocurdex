import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Animated, StyleSheet } from "react-native";
import { useThemeColors } from "@/theme";

const APPEAR_DELAY_MS = 300;
const FADE_IN_MS = 200;

export function PendingIndicator() {
  const { t } = useTranslation("common");
  const colors = useThemeColors();
  const [opacity] = useState(() => new Animated.Value(0));
  const appear = () =>
    Animated.timing(opacity, {
      toValue: 1,
      delay: APPEAR_DELAY_MS,
      duration: FADE_IN_MS,
      useNativeDriver: true,
    }).start();
  return (
    <Animated.View style={[styles.fill, { opacity }]} onLayout={appear}>
      <ActivityIndicator
        accessibilityLabel={t("loading")}
        testID="pending-indicator"
        color={colors.mutedForeground}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: "center", justifyContent: "center" },
});
