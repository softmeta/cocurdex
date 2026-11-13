import type { ReactNode } from "react";
import {
  type LayoutChangeEvent,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import Animated, {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { layout, useThemeColors } from "@/theme";

const FADE_WIDTH = layout.sideMargin * 2;

export function EdgeFadeScrollRow({
  children,
  contentContainerStyle,
  style,
  fadeColor,
  keyboardShouldPersistTaps,
  accessibilityRole,
  testID,
}: {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  fadeColor?: string;
  keyboardShouldPersistTaps?: "always" | "handled" | "never";
  accessibilityRole?: "tablist";
  testID?: string;
}) {
  const colors = useThemeColors();
  const color = fadeColor ?? colors.background;
  const offset = useSharedValue(0);
  const viewport = useSharedValue(0);
  const content = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    offset.value = event.contentOffset.x;
  });
  const startFade = useAnimatedStyle(() => ({
    opacity: interpolate(offset.value, [0, FADE_WIDTH], [0, 1], "clamp"),
  }));
  const endFade = useAnimatedStyle(() => {
    const remaining = content.value - viewport.value - offset.value;
    return {
      opacity: interpolate(remaining, [0, FADE_WIDTH], [0, 1], "clamp"),
    };
  });
  return (
    <View style={[styles.frame, style]}>
      <Animated.ScrollView
        horizontal
        accessibilityRole={accessibilityRole}
        contentContainerStyle={contentContainerStyle}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        onContentSizeChange={(width) => {
          content.value = width;
        }}
        onLayout={(event: LayoutChangeEvent) => {
          viewport.value = event.nativeEvent.layout.width;
        }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
        testID={testID}
      >
        {children}
      </Animated.ScrollView>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.fade,
          styles.start,
          { backgroundImage: `linear-gradient(to left, ${color}00, ${color})` },
          startFade,
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.fade,
          styles.end,
          {
            backgroundImage: `linear-gradient(to right, ${color}00, ${color})`,
          },
          endFade,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flexGrow: 0 },
  fade: { position: "absolute", top: 0, bottom: 0, width: FADE_WIDTH },
  start: { left: 0 },
  end: { right: 0 },
});
