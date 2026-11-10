import { type ReactNode, useState } from "react";
import { type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";
import { useKeyboardHandler } from "react-native-keyboard-controller";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useThemeColors } from "@/theme";

export interface KeyboardFollow {
  shown: boolean;
  settledHeight: number;
  restingInset: number;
  dockStyle: ReturnType<typeof useAnimatedStyle>;
}

export function useKeyboardFollow(restingInset: number): KeyboardFollow {
  const height = useSharedValue(0);
  const [shown, setShown] = useState(false);
  const [settledHeight, setSettledHeight] = useState(0);
  useKeyboardHandler(
    {
      onStart: (event) => {
        "worklet";
        scheduleOnRN(setShown, event.height > 0);
        if (event.height === 0) scheduleOnRN(setSettledHeight, 0);
      },
      onMove: (event) => {
        "worklet";
        height.value = event.height;
      },
      onInteractive: (event) => {
        "worklet";
        height.value = event.height;
      },
      onEnd: (event) => {
        "worklet";
        height.value = event.height;
        scheduleOnRN(setShown, event.height > 0);
        scheduleOnRN(setSettledHeight, event.height);
      },
    },
    [],
  );
  const dockStyle = useAnimatedStyle(
    () => ({
      transform: [{ translateY: -Math.max(height.value - restingInset, 0) }],
    }),
    [restingInset],
  );
  return { shown, settledHeight, restingInset, dockStyle };
}

export function KeyboardDock({
  follow,
  dock,
  children,
  style,
}: {
  follow: KeyboardFollow;
  dock: ReactNode;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useThemeColors();
  const [dockHeight, setDockHeight] = useState(0);
  const docked = dock !== null && dock !== undefined && dock !== false;
  const keyboardLift = Math.max(follow.settledHeight - follow.restingInset, 0);
  const contentInset = (docked ? dockHeight : 0) + keyboardLift;
  return (
    <View style={[styles.fill, style]}>
      <View style={[styles.fill, { paddingBottom: contentInset }]}>
        {children}
      </View>
      {docked ? (
        <Animated.View
          onLayout={(event) => setDockHeight(event.nativeEvent.layout.height)}
          style={[
            styles.dock,
            {
              paddingBottom: follow.restingInset,
              backgroundColor: colors.background,
            },
            follow.dockStyle,
          ]}
        >
          {dock}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  dock: { position: "absolute", left: 0, right: 0, bottom: 0 },
});
