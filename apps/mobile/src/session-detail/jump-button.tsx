import type { JumpButtonKind } from "@cocurdex/shared";
import { SymbolView } from "expo-symbols";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { space, useThemeColors, useThemeName } from "@/theme";

const SIZE = 40;
const DOT = 10;
const STREAM_DOT = 5;
const DOT_DELAYS = [0, 160, 320] as const;
const FILL = { light: "#e5e5e5", dark: "#333333" } as const;

export function JumpButton({
  target,
  streaming = false,
  unseen,
  onPress,
}: {
  target: Exclude<JumpButtonKind, null>;
  streaming?: boolean;
  unseen: boolean;
  onPress(): void;
}) {
  const { t } = useTranslation("sessions");
  const colors = useThemeColors();
  const fill = FILL[useThemeName()];
  const latest = target === "latest";
  return (
    <View pointerEvents="box-none" style={styles.slot}>
      <Pressable
        testID="transcript-jump"
        accessibilityRole="button"
        accessibilityLabel={
          latest ? t("detail.jumpToLatest") : t("detail.jumpToOldest")
        }
        hitSlop={space.xs}
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: fill },
          pressed && styles.pressed,
        ]}
      >
        {latest && streaming ? (
          <StreamingDots color={colors.foreground} />
        ) : (
          <SymbolView
            name={
              latest
                ? { ios: "arrow.down", android: "arrow_downward" }
                : { ios: "arrow.up", android: "arrow_upward" }
            }
            size={18}
            tintColor={colors.foreground}
          />
        )}

        {latest && unseen && !streaming ? (
          <View
            style={[
              styles.dot,
              { backgroundColor: colors.tint, borderColor: fill },
            ]}
          />
        ) : null}
      </Pressable>
    </View>
  );
}

function StreamingDots({ color }: { color: string }) {
  return (
    <View
      testID="transcript-jump-streaming"
      pointerEvents="none"
      accessible={false}
      style={styles.dots}
    >
      {DOT_DELAYS.map((delay) => (
        <StreamingDot key={delay} color={color} delay={delay} />
      ))}
    </View>
  );
}

function StreamingDot({ color, delay }: { color: string; delay: number }) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);
  const attach = useCallback(
    (node: unknown) => {
      if (!node || reduced) return;
      progress.value = withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 360, easing: Easing.out(Easing.quad) }),
            withTiming(0, { duration: 360, easing: Easing.in(Easing.quad) }),
            withTiming(0, { duration: 480 }),
          ),
          -1,
        ),
      );
      return () => cancelAnimation(progress);
    },
    [delay, progress, reduced],
  );
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: reduced ? 1 : 0.35 + progress.value * 0.65,
    transform: [{ translateY: reduced ? 0 : -1.5 * progress.value }],
  }));
  return (
    <Animated.View
      ref={attach}
      style={[styles.streamDot, { backgroundColor: color }, animatedStyle]}
    />
  );
}

const styles = StyleSheet.create({
  slot: {
    position: "absolute",
    start: 0,
    end: 0,
    bottom: space.lg,
    alignItems: "center",
  },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  dots: { flexDirection: "row", alignItems: "center", gap: 3 },
  streamDot: {
    width: STREAM_DOT,
    height: STREAM_DOT,
    borderRadius: STREAM_DOT / 2,
  },
  pressed: { opacity: 0.6 },
  dot: {
    position: "absolute",
    top: 0,
    right: 0,
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 2,
  },
});
