import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import { Animated, Easing, Image, StyleSheet, View } from "react-native";
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
const CARET_HALF_CYCLE_MS = 160;
const CARET_MASK_WIDTH = 19;
const CARET_SHORTENED_OFFSET = 8;

export function LaunchOverlay() {
  const phase = useSyncExternalStore(subscribeToLaunch, getLaunchPhase);
  const active = phase !== "finished";
  const dark = useThemeName() === "dark";
  const backgroundColor = dark ? "#141414" : "#ffffff";
  const reducedMotion = useReducedMotion();
  const [hasLayout, setHasLayout] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [played, setPlayed] = useState(false);
  const [caretMask] = useState(() => new Animated.Value(CARET_MASK_WIDTH));

  useLayoutEffect(() => {
    if (!active || !hasLayout || !imageLoaded) return;

    let animation: Animated.CompositeAnimation | undefined;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if (reducedMotion) {
          setPlayed(true);
          return;
        }

        hideNativeSplash();
        frame = requestAnimationFrame(() => {
          const timing = {
            duration: CARET_HALF_CYCLE_MS,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
            isInteraction: false,
          };
          animation = Animated.sequence([
            Animated.timing(caretMask, {
              ...timing,
              toValue: CARET_SHORTENED_OFFSET,
            }),
            Animated.timing(caretMask, {
              ...timing,
              toValue: CARET_MASK_WIDTH,
            }),
          ]);
          animation.start(({ finished }) => {
            if (finished) setPlayed(true);
          });
        });
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      animation?.stop();
    };
  }, [active, hasLayout, imageLoaded, caretMask, reducedMotion]);

  useLayoutEffect(() => {
    if (phase === "ready" && played) finishLaunch();
  }, [phase, played]);

  if (!active) return null;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={() => setHasLayout(true)}
      style={[styles.overlay, { backgroundColor }]}
    >
      <View style={styles.mark}>
        <Image
          source={dark ? darkMark : lightMark}
          onLoad={() => setImageLoaded(true)}
          fadeDuration={0}
          resizeMode="contain"
          style={styles.mark}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.caretMask,
            { backgroundColor, transform: [{ translateX: caretMask }] },
          ]}
        />
      </View>
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
  caretMask: {
    position: "absolute",
    left: 42,
    top: 39,
    width: CARET_MASK_WIDTH,
    height: 12,
  },
});
