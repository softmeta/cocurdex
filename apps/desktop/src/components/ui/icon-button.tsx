import type * as React from "react";

import { Button } from "@/components/ui/button";

/*
 * IconButton primitive.
 *
 * Thin semantic wrapper over `<Button size="icon-*">` for icon-only actions.
 *
 *   - Requires `aria-label` at the type level so icon-only buttons stay
 *     accessible (Button itself accepts but does not enforce this).
 *   - Defaults to `variant="ghost"` because that is by far the dominant style
 *     for icon affordances in this app (toolbar buttons, list-row actions,
 *     dialog close, etc.). Override `variant` when you specifically want
 *     a destructive / outline / default icon button.
 *   - `size` maps 1:1 to Button's icon variants:
 *       xs  -> icon-xs  (size-6, svg size-3)
 *       sm  -> icon-sm  (size-8)
 *       md  -> icon     (size-9)   — the project's default
 *       lg  -> icon-lg  (size-10)
 *
 * Prefer this over a bare `<Button size="icon-*">` so future audits can
 * grep for icon affordances and so the aria-label requirement is enforced
 * at compile time.
 */
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
};

export function IconButton({
  size = "md",
  variant = "ghost",
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <Button
      data-slot="icon-button"
      size={sizeMap[size]}
      variant={variant}
      type={type}
      {...props}
    />
  );
}
