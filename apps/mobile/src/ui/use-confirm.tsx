import { Alert } from "react-native";
import type { ConfirmRequest } from "./confirm-request";

function confirm(request: ConfirmRequest) {
  Alert.alert(request.title, request.message, [
    { text: request.cancelLabel, style: "cancel" },
    {
      text: request.confirmLabel,
      style: request.destructive ? "destructive" : "default",
      onPress: request.onConfirm,
    },
  ]);
}

export function useConfirm() {
  return { confirm, dialog: null };
}
