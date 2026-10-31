import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import {
  SafeAreaInsetsContext,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { SheetGrabber } from "./sheet-grabber";
import { SurfaceContext } from "./surface-context";

export function SheetSurface({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <SurfaceContext value="sheet">
      <SafeAreaInsetsContext value={{ ...insets, top: 0 }}>
        <View style={styles.fill}>
          <SheetGrabber />
          {children}
        </View>
      </SafeAreaInsetsContext>
    </SurfaceContext>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
