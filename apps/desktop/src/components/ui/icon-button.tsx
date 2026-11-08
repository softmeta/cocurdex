import type * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type IconButtonSize = "xs" | "sm" | "md" | "lg";

type ButtonProps = React.ComponentProps<typeof Button>;

const sizeMap: Record<IconButtonSize, NonNullable<ButtonProps["size"]>> = {
  xs: "icon-xs",
  sm: "icon-sm",
  md: "icon",
  lg: "icon-lg",
};

export type IconButtonProps = Omit<ButtonProps, "size" | "aria-label"> & {
  "aria-label": string;
  size?: IconButtonSize;
  tooltip?: React.ReactNode | false;
  tooltipSide?: React.ComponentProps<typeof TooltipContent>["side"];
};

export function IconButton({
  size = "md",
  variant = "ghost",
  type = "button",
  tooltip,
  tooltipSide = "top",
  ...props
}: IconButtonProps) {
  const button = (
    <Button
      data-slot="icon-button"
      size={sizeMap[size]}
      variant={variant}
      type={type}
      {...props}
    />
  );
  if (tooltip === false) return button;
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side={tooltipSide} sideOffset={6}>
        {tooltip ?? props["aria-label"]}
      </TooltipContent>
    </Tooltip>
  );
}
