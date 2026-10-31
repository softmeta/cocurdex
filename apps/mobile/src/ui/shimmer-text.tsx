import { useState } from "react";
import {
  Animated,
  Easing,
  type StyleProp,
  StyleSheet,
  Text,
  type TextStyle,
  View,
} from "react-native";

const SWEEP_MS = 1800;
const BAND_OPACITY = [0.2, 0.45, 0.75, 1, 0.75, 0.45, 0.2] as const;
const BAND_SHARE = 0.06;

function startSweep(progress: Animated.Value) {
  progress.setValue(0);
  const sweep = Animated.loop(
    Animated.timing(progress, {
      toValue: 1,
      duration: SWEEP_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    }),
  );
  sweep.start();
  return () => sweep.stop();
}

export function ShimmerText({
  text,
  baseColor,
  highlightColor,
  style,
  testID,
}: {
  text: string;
  baseColor: string;
  highlightColor: string;
  style?: StyleProp<TextStyle>;
  testID?: string;
}) {
  const [progress] = useState(() => new Animated.Value(0));
  const [attachSweep] = useState(() => (node: unknown) => {
    if (node) return startSweep(progress);
  });
  const [width, setWidth] = useState(0);
  const bandWidth = Math.max(width * BAND_SHARE, 2);
  const span = bandWidth * BAND_OPACITY.length;
  const start = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-span, width],
  });
  return (
    <View ref={attachSweep}>
      <Text
        numberOfLines={1}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={[style, { color: baseColor }]}
        testID={testID}
      >
        {text}
      </Text>
      {width > 0
        ? BAND_OPACITY.map((opacity, index) => {
            const left = Animated.add(start, index * bandWidth);
            return (
              <Animated.View
                // biome-ignore lint/suspicious/noArrayIndexKey: bands are a fixed list
                key={index}
                importantForAccessibility="no-hide-descendants"
                accessibilityElementsHidden
                style={[
                  styles.band,
                  { width: bandWidth, transform: [{ translateX: left }] },
                ]}
              >
                <Animated.Text
                  numberOfLines={1}
                  style={[
                    style,
                    {
                      width,
                      color: highlightColor,
                      opacity,
                      transform: [{ translateX: Animated.multiply(left, -1) }],
                    },
                  ]}
                >
                  {text}
                </Animated.Text>
              </Animated.View>
            );
          })
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    overflow: "hidden",
  },
});
