import { Stack } from "expo-router";
import type { SheetActionProps } from "./sheet-action-props";

export function SheetAction({ label, disabled, onPress }: SheetActionProps) {
  return (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Button
        icon="checkmark"
        accessibilityLabel={label}
        disabled={disabled}
        onPress={onPress}
      />
    </Stack.Toolbar>
  );
}
