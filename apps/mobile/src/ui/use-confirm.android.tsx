import { AlertDialog, Text, TextButton } from "@expo/ui/jetpack-compose";
import { useState } from "react";
import { useThemeColors } from "@/theme";
import type { ConfirmRequest } from "./confirm-request";

export function useConfirm() {
  const colors = useThemeColors();
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const dismiss = () => setRequest(null);
  const dialog = request ? (
    <AlertDialog
      onDismissRequest={dismiss}
      colors={{
        containerColor: colors.popover,
        titleContentColor: colors.foreground,
        textContentColor: colors.mutedForeground,
      }}
    >
      <AlertDialog.Title>
        <Text>{request.title}</Text>
      </AlertDialog.Title>
      <AlertDialog.Text>
        <Text>{request.message}</Text>
      </AlertDialog.Text>
      <AlertDialog.DismissButton>
        <TextButton onClick={dismiss} colors={{ contentColor: colors.tint }}>
          <Text>{request.cancelLabel}</Text>
        </TextButton>
      </AlertDialog.DismissButton>
      <AlertDialog.ConfirmButton>
        <TextButton
          onClick={() => {
            dismiss();
            request.onConfirm();
          }}
          colors={{
            contentColor: request.destructive
              ? colors.destructive
              : colors.tint,
          }}
        >
          <Text>{request.confirmLabel}</Text>
        </TextButton>
      </AlertDialog.ConfirmButton>
    </AlertDialog>
  ) : null;
  return { confirm: setRequest, dialog };
}
