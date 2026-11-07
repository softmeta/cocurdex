import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface AppConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  variant?: "default" | "destructive";
  onConfirm: () => void;
}

export function AppConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  cancelLabel,
  confirmLabel,
  variant = "default",
  onConfirm,
}: AppConfirmDialogProps) {
  const destructive = variant === "destructive";

  return (
    <Dialog disablePointerDismissal open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} size="alert">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter actions="fill">
          <Button
            size="lg"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            size="lg"
            variant={destructive ? "destructive" : "default"}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
