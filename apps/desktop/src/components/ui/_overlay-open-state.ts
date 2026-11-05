import { createContext, type ReactNode, useContext, useState } from "react";

export const OverlayOpenContext = createContext(true);

interface OverlayRootOpenProps<Details> {
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean, details: Details) => void;
  open?: boolean;
}

export function useOverlayRootOpen<Details>({
  defaultOpen,
  onOpenChange,
  open,
}: OverlayRootOpenProps<Details>) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(
    defaultOpen ?? false,
  );
  return {
    isOpen: open ?? uncontrolledOpen,
    onOpenChange(next: boolean, details: Details) {
      setUncontrolledOpen(next);
      onOpenChange?.(next, details);
    },
  };
}

export function useContentWhileClosing(children: ReactNode) {
  const open = useContext(OverlayOpenContext);
  const [retained, setRetained] = useState(children);
  if (open && retained !== children) {
    setRetained(children);
  }
  return open ? children : retained;
}
