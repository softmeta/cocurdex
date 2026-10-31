import { Stack } from "expo-router";
import type { CloseButtonProps } from "./close-button-props";

export function CloseButton({ accessibilityLabel, onPress }: CloseButtonProps) {
  return (
    <Stack.Toolbar placement="left">
      <Stack.Toolbar.Button
        icon="xmark"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
      />
    </Stack.Toolbar>
  );
}
