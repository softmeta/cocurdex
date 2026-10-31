export interface ConfirmRequest {
  title: string;
  message: string;
  cancelLabel: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm(): void;
}
