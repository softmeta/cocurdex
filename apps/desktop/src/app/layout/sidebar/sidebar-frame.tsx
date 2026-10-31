import { ArrowLeft } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { ResizeSeparator } from "@/components/resize-separator";
import { TitlebarIconButton } from "../titlebar-icon-button";

export { ResizeSeparator } from "@/components/resize-separator";
export {
  SidebarToggleButton,
  TitlebarButton,
  TitlebarIconButton,
} from "../titlebar-icon-button";

export function ScreenBackButton({
  canGoBack,
  label,
  onGoBack,
}: {
  canGoBack: boolean;
  label: string;
  onGoBack(): void;
}) {
  return (
    <TitlebarIconButton
      aria-label={label}
      disabled={!canGoBack}
      onClick={onGoBack}
    >
      <ArrowLeft className="size-3.5 rtl:-scale-x-100" />
    </TitlebarIconButton>
  );
}

export function ResizableSidebarSlot({
  children,
  isOpen,
  separatorAriaLabel,
  width,
  onResizeMouseDown,
}: {
  children: ReactNode;
  isOpen: boolean;
  separatorAriaLabel: string;
  width: number;
  onResizeMouseDown(event: MouseEvent): void;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <>
      <div className="shrink-0" style={{ width }}>
        {children}
      </div>
      <ResizeSeparator
        ariaLabel={separatorAriaLabel}
        onMouseDown={onResizeMouseDown}
      />
    </>
  );
}
