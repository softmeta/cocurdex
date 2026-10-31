import { Stack } from "expo-router";
import type { HeaderButtonsProps } from "./header-buttons-props";

export function HeaderButtons({ items }: HeaderButtonsProps) {
  return (
    <Stack.Toolbar placement="right">
      {items.map((item) => (
        <Stack.Toolbar.Button
          key={item.key}
          icon={item.icon.ios}
          accessibilityLabel={item.label}
          hidden={item.hidden}
          disabled={item.disabled}
          onPress={item.onPress}
        />
      ))}
    </Stack.Toolbar>
  );
}
