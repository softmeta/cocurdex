import { Stack } from "expo-router";
import { CircleButton } from "./circle-button";
import type { SheetActionProps } from "./sheet-action-props";

export function SheetAction({ label, disabled, onPress }: SheetActionProps) {
  return (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.View>
        <CircleButton
          tonal
          icon={{ ios: "checkmark", android: "check" }}
          label={label}
          disabled={disabled}
          onPress={onPress}
        />
      </Stack.Toolbar.View>
    </Stack.Toolbar>
  );
}
