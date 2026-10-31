import { Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AppConfirmDialog } from "./confirm-dialog";

export interface AppRemoveButtonProps {
  label: string;
  confirmTitle: ReactNode;
  confirmDescription: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
  busy?: boolean;
}

export function AppRemoveButton({
  label,
  confirmTitle,
  confirmDescription,
  confirmLabel,
  cancelLabel,
  onConfirm,
  disabled = false,
  busy = false,
}: AppRemoveButtonProps) {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <Button
        className="-ms-2.5 text-muted-foreground hover:text-destructive"
        disabled={disabled || busy}
        size="sm"
        type="button"
        variant="ghost"
        onClick={() => setConfirming(true)}
      >
        {busy ? <Spinner size="xs" /> : <Trash2 className="size-3.5" />}
        {label}
      </Button>
      <AppConfirmDialog
        cancelLabel={cancelLabel}
        confirmLabel={confirmLabel}
        description={confirmDescription}
        open={confirming}
        title={confirmTitle}
        variant="destructive"
        onConfirm={onConfirm}
        onOpenChange={setConfirming}
      />
    </>
  );
}
