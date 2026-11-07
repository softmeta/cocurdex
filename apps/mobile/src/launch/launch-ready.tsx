import { StyleSheet, View } from "react-native";
import { markLaunchReady } from "./launch-splash";

export function LaunchReady() {
  return (
    <View
      onLayout={markLaunchReady}
      pointerEvents="none"
      style={styles.marker}
    />
  );
}

const styles = StyleSheet.create({
  marker: { position: "absolute", width: 0, height: 0 },
});
