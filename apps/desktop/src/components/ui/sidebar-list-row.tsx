import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

export const sidebarListRowVariants = cva(
  "peer/menu-button group/list-row group/menu-button relative flex w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-control text-start outline-hidden transition-colors disabled:pointer-events-none disabled:opacity-50 [&>svg]:shrink-0 [&>span:last-child]:truncate",
  {
    variants: {
      variant: {
        default:
          "text-sidebar-fg-secondary hover:bg-sidebar-surface-hover hover:text-sidebar-fg data-active:bg-sidebar-surface-active data-active:text-sidebar-fg data-active:hover:bg-sidebar-surface-active data-active:hover:text-sidebar-fg",
        muted:
          "text-sidebar-fg-muted hover:bg-sidebar-surface-hover hover:text-sidebar-fg-secondary data-active:bg-sidebar-surface-active data-active:text-sidebar-fg data-active:hover:bg-sidebar-surface-active data-active:hover:text-sidebar-fg",
        subtle:
          "font-normal text-sidebar-fg-secondary hover:bg-sidebar-surface-hover hover:text-sidebar-fg data-active:font-normal data-active:text-sidebar-fg",
      },
      size: {
        default: "h-7 px-2 text-body [&>svg]:size-3.5",
        sm: "h-6 px-1 text-body [&>svg]:size-3.5",
        lg: "h-8 px-2 text-body [&>svg]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type SidebarListRowOwnProps = {
  isActive?: boolean;
} & VariantProps<typeof sidebarListRowVariants>;

function SidebarListRow({
  render,
  isActive = false,
  variant = "default",
  size = "default",
  className,
  ...props
}: useRender.ComponentProps<"div"> &
  React.ComponentProps<"div"> &
  SidebarListRowOwnProps) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(sidebarListRowVariants({ variant, size }), className),
      },
      props,
    ),
    render,
    state: {
      slot: "sidebar-list-row",
      active: isActive,
    },
  });
}

function SidebarListRowLabel({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      className={cn("min-w-0 flex-1 truncate text-body leading-5", className)}
      {...props}
    />
  );
}

type SidebarListRowActionsProps = React.ComponentProps<"div"> & {
  visibility?: "hover" | "hover-reveal" | "active-hover";
};

function SidebarListRowActions({
  className,
  visibility = "hover",
  ...props
}: SidebarListRowActionsProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-0.5 transition-opacity",
        visibility === "hover" &&
          "opacity-0 group-hover/list-row:opacity-100 focus-within:opacity-100",
        visibility === "hover-reveal" &&
          "hidden group-hover/list-row:flex group-focus-within/list-row:flex",
        visibility === "active-hover" &&
          "pointer-events-none opacity-0 group-data-[active]/list-row:pointer-events-auto group-data-[active]/list-row:group-hover/list-row:opacity-100 group-data-[active]/list-row:focus-within:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

function SidebarListRowDisclosure({
  className,
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "-mx-0.75 flex size-5 shrink-0 items-center justify-center rounded-control text-sidebar-fg-muted outline-hidden hover:text-sidebar-fg focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}

export type { SidebarListRowActionsProps, SidebarListRowOwnProps };
export {
  SidebarListRow,
  SidebarListRowActions,
  SidebarListRowDisclosure,
  SidebarListRowLabel,
};
