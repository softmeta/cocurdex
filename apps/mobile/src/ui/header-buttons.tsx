import { Stack } from "expo-router";
import { StyleSheet, View } from "react-native";
import { space } from "@/theme";
import { CircleButton } from "./circle-button";
import type { HeaderButtonsProps } from "./header-buttons-props";

export function HeaderButtons({ items }: HeaderButtonsProps) {
  const shown = items.filter((item) => !item.hidden);
  return (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.View>
        <View style={styles.row}>
          {shown.map((item) => (
            <CircleButton
              key={item.key}
              tonal
              icon={item.icon}
              label={item.label}
              disabled={item.disabled}
              onPress={item.onPress}
            />
          ))}
        </View>
      </Stack.Toolbar.View>
    </Stack.Toolbar>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space.sm },
});
