import type { ReactNode } from "react";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib";

export function PreviewToolbarButton({
  children,
  className,
  disabled = false,
  label,
  onClick,
  tooltipSide = "top",
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  label: string;
  onClick(): void;
  tooltipSide?: "bottom" | "top";
}) {
  return (
    <IconButton
      aria-label={label}
      className={cn("text-chat-fg-muted hover:text-chat-fg", className)}
      disabled={disabled}
      onClick={onClick}
      size="xs"
      tooltipSide={tooltipSide}
    >
      {children}
    </IconButton>
  );
}
