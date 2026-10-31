import { Stack } from "expo-router";
import { CircleButton } from "./circle-button";
import type { CloseButtonProps } from "./close-button-props";

export function CloseButton({
  accessibilityLabel,
  onPress,
  scheme,
}: CloseButtonProps) {
  return (
    <>
      <Stack.Screen options={{ headerBackVisible: false }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.View>
          <CircleButton
            tonal
            scheme={scheme}
            icon={{ ios: "xmark", android: "close" }}
            label={accessibilityLabel}
            onPress={onPress}
          />
        </Stack.Toolbar.View>
      </Stack.Toolbar>
    </>
  );
}
