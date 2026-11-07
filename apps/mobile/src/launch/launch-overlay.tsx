import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useThemeName } from "@/theme";
import {
  finishLaunch,
  getLaunchPhase,
  hideNativeSplash,
  subscribeToLaunch,
} from "./launch-splash";

const lightMark = require("../../assets/splash-mark.png");
const darkMark = require("../../assets/splash-mark-dark.png");
const EXIT_DURATION_MS = 240;

export function LaunchOverlay() {
  const phase = useSyncExternalStore(subscribeToLaunch, getLaunchPhase);
  const dark = useThemeName() === "dark";
  const reducedMotion = useReducedMotion();
  const [hasLayout, setHasLayout] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [opacity] = useState(() => new Animated.Value(1));

  useLayoutEffect(() => {
    if (phase !== "ready" || !hasLayout || !imageLoaded) return;

    let animation: Animated.CompositeAnimation | undefined;
    let startFrame: number | undefined;
    const handoffFrame = requestAnimationFrame(() => {
      startFrame = requestAnimationFrame(() => {
        if (reducedMotion) {
          finishLaunch();
          return;
        }

        hideNativeSplash();
        animation = Animated.timing(opacity, {
          toValue: 0,
          duration: EXIT_DURATION_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
          isInteraction: false,
        });
        animation.start(({ finished }) => {
          if (finished) finishLaunch();
        });
      });
    });
    return () => {
      cancelAnimationFrame(handoffFrame);
      if (startFrame !== undefined) cancelAnimationFrame(startFrame);
      animation?.stop();
    };
  }, [phase, hasLayout, imageLoaded, opacity, reducedMotion]);

  if (phase === "finished") return null;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={() => setHasLayout(true)}
      style={[
        styles.overlay,
        { backgroundColor: dark ? "#141414" : "#ffffff" },
      ]}
    >
      <Animated.Image
        source={dark ? darkMark : lightMark}
        onLoad={() => setImageLoaded(true)}
        fadeDuration={0}
        resizeMode="contain"
        style={[
          styles.mark,
          {
            opacity,
            transform: [
              {
                scale: opacity.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.88, 1],
                }),
              },
            ],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  mark: { width: 80, height: 80 },
});
