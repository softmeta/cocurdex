import { useCallback } from "react";
import { View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { useThemeColors } from "@/theme";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const LENGTH = 9 + Math.PI * 3.25;

export function WorkingMark() {
  const colors = useThemeColors();
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);
  const attach = useCallback(
    (node: unknown) => {
      if (!node || reduced) return;
      progress.value = withRepeat(
        withTiming(1, { duration: 1600, easing: Easing.linear }),
        -1,
      );
      return () => cancelAnimation(progress);
    },
    [progress, reduced],
  );
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: reduced
      ? 0
      : interpolate(progress.value, [0, 0.45, 0.7, 1], [LENGTH, 0, 0, -LENGTH]),
  }));
  return (
    <View ref={attach} accessible={false}>
      <Svg
        width={20}
        height={20}
        viewBox="0 0 24 24"
        fill="none"
        stroke={colors.brandMark}
        strokeWidth={2.75}
        strokeLinecap="round"
      >
        <AnimatedPath
          d="M16 7.25h-5.25A3.25 3.25 0 0 0 7.5 10.5v3.25a3.25 3.25 0 0 0 3.25 3.25h.5"
          strokeDasharray={[LENGTH, LENGTH]}
          animatedProps={animatedProps}
        />
        <Path d="M14.25 13.5h2.25" />
      </Svg>
    </View>
  );
}
