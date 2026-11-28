import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib";

export type AppRailIconButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "aria-label"
> & {
  "aria-label": string;
  active?: boolean;
  children: ReactNode;
  dot?: ReactNode;
  tooltip?: false;
};

export const AppRailIconButton = forwardRef<
  HTMLButtonElement,
  AppRailIconButtonProps
>(function AppRailIconButton(
  {
    "aria-label": ariaLabel,
    active = false,
    children,
    className,
    dot,
    tooltip,
    type = "button",
    ...props
  },
  ref,
) {
  const button = (
    <button
      ref={ref}
      aria-current={active ? "page" : undefined}
      aria-label={ariaLabel}
      className={cn(
        "relative flex size-8 shrink-0 items-center justify-center rounded-control text-sidebar-fg-muted transition-colors hover:bg-sidebar-surface-hover hover:text-sidebar-fg data-popup-open:bg-sidebar-surface-hover",
        active && "bg-sidebar-surface-active text-sidebar-fg",
        className,
      )}
      type={type}
      {...props}
    >
      {children}
      {dot}
    </button>
  );
  if (tooltip === false) return button;
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side="right" sideOffset={8}>
        {ariaLabel}
      </TooltipContent>
    </Tooltip>
  );
});
