import type { MouseEvent, ReactNode } from "react";
import { ResizeSeparator } from "@/components/resize-separator";

export { ResizeSeparator } from "@/components/resize-separator";
export {
  SidebarToggleButton,
  TitlebarButton,
  TitlebarIconButton,
} from "../titlebar-icon-button";

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
      <div className="shrink-0" data-window-sidebar="" style={{ width }}>
        {children}
      </div>
      <div
        className="relative z-10 flex shrink-0 bg-sidebar"
        data-window-sidebar-edge=""
      >
        <ResizeSeparator
          ariaLabel={separatorAriaLabel}
          onMouseDown={onResizeMouseDown}
        />
      </div>
    </>
  );
}
