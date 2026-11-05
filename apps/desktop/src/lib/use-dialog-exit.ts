import { useState } from "react";

export function useDialogExit(onClosed: () => void) {
  const [open, setOpen] = useState(true);
  return {
    open,
    close() {
      setOpen(false);
    },
    onOpenChangeComplete(next: boolean) {
      if (!next) onClosed();
    },
  };
}

export function useMountedUntilClosed(open: boolean) {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) {
    setMounted(true);
  }
  return {
    mounted: open || mounted,
    onOpenChangeComplete(next: boolean) {
      if (!next) setMounted(false);
    },
  };
}
