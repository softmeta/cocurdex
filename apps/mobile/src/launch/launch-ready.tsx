import { StyleSheet, View } from "react-native";
import { revealApp } from "./launch-splash";

export function LaunchReady() {
  return (
    <View onLayout={revealApp} pointerEvents="none" style={styles.marker} />
  );
}

const styles = StyleSheet.create({
  marker: { position: "absolute", width: 0, height: 0 },
});
