import { ArrowLeft, ArrowRight, PanelLeft } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { ResizeSeparator } from "@/components/resize-separator";
import { cn } from "@/lib";
import {
  TITLEBAR_ICON_GLYPH_CLASS,
  TitlebarIconButton,
} from "../titlebar-icon-button";

export { ResizeSeparator } from "@/components/resize-separator";
export { TitlebarButton, TitlebarIconButton } from "../titlebar-icon-button";

/**
 * Browser-style back/forward arrows used in the app and settings titlebars to
 * move through the screen history. Buttons disable at the ends of the history.
 * Arrows are directional, so they mirror horizontally under RTL
 * (`rtl:-scale-x-100`) to keep "back" pointing toward the start edge.
 */
export function ScreenNavButtons({
  backLabel,
  canGoBack,
  canGoForward,
  forwardLabel,
  onGoBack,
  onGoForward,
}: {
  backLabel: string;
  canGoBack: boolean;
  canGoForward: boolean;
  forwardLabel: string;
  onGoBack(): void;
  onGoForward(): void;
}) {
  return (
    <>
      <TitlebarIconButton
        aria-label={backLabel}
        disabled={!canGoBack}
        onClick={onGoBack}
      >
        <ArrowLeft
          className={cn(TITLEBAR_ICON_GLYPH_CLASS, "rtl:-scale-x-100")}
        />
      </TitlebarIconButton>
      <TitlebarIconButton
        aria-label={forwardLabel}
        disabled={!canGoForward}
        onClick={onGoForward}
      >
        <ArrowRight
          className={cn(TITLEBAR_ICON_GLYPH_CLASS, "rtl:-scale-x-100")}
        />
      </TitlebarIconButton>
    </>
  );
}

export function SidebarToggleButton({
  ariaLabel,
  className,
  onToggle,
}: {
  ariaLabel: string;
  className?: string;
  onToggle(): void;
}) {
  return (
    <TitlebarIconButton
      aria-label={ariaLabel}
      className={className}
      onClick={onToggle}
    >
      <PanelLeft className={TITLEBAR_ICON_GLYPH_CLASS} />
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
  separatorAriaLabel?: string;
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
