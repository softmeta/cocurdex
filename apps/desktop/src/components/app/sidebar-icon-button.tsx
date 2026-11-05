import {
  type ButtonHTMLAttributes,
  type ComponentProps,
  forwardRef,
  type ReactNode,
} from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib";

export type AppSidebarIconButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "aria-label"
> & {
  "aria-label": string;
  children?: ReactNode;
  tooltip?: false;
  tooltipSide?: ComponentProps<typeof TooltipContent>["side"];
};

export const AppSidebarIconButton = forwardRef<
  HTMLButtonElement,
  AppSidebarIconButtonProps
>(function AppSidebarIconButton(
  {
    "aria-label": ariaLabel,
    children,
    className,
    tooltip,
    tooltipSide = "bottom",
    type = "button",
    ...props
  },
  ref,
) {
  const button = (
    <button
      ref={ref}
      aria-label={ariaLabel}
      className={cn(
        "relative flex size-7 shrink-0 items-center justify-center rounded-control text-sidebar-fg-muted transition-colors hover:bg-sidebar-surface-hover hover:text-sidebar-fg data-popup-open:bg-sidebar-surface-hover",
        className,
      )}
      type={type}
      {...props}
    >
      {children}
    </button>
  );

  if (tooltip === false) {
    return button;
  }
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side={tooltipSide} sideOffset={8}>
        {ariaLabel}
      </TooltipContent>
    </Tooltip>
  );
});
