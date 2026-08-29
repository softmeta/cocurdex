import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Shared surface for every sidebar-style list row (chat sessions, notes tree,
 * issue boards, settings nav). One height / radius / hover / selected contract
 * so leaf lists do not invent parallel treatments.
 *
 * `data-active` is set when `isActive` is true (via useRender state). Active
 * fill is locked under hover so the selected row does not flash to hover tint.
 */
export const sidebarListRowVariants = cva(
  "peer/menu-button group/list-row group/menu-button relative flex w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-control text-start outline-hidden transition-colors disabled:pointer-events-none disabled:opacity-50 [&>svg]:shrink-0 [&>span:last-child]:truncate",
  {
    variants: {
      variant: {
        // Selectable leaf: idle secondary text, hover step, deeper selected step.
        default:
          "text-sidebar-fg-secondary hover:bg-sidebar-surface-hover hover:text-sidebar-fg data-active:bg-sidebar-surface-active data-active:font-medium data-active:text-sidebar-fg data-active:hover:bg-sidebar-surface-active data-active:hover:text-sidebar-fg",
        // Quieter idle text (e.g. pure-chat list); same hover/selected surfaces.
        muted:
          "text-sidebar-fg-muted hover:bg-sidebar-surface-hover hover:text-sidebar-fg-secondary data-active:bg-sidebar-surface-active data-active:font-medium data-active:text-sidebar-fg data-active:hover:bg-sidebar-surface-active data-active:hover:text-sidebar-fg",
        // Parent/group row (e.g. workspace): selected is color only, same weight.
        subtle:
          "font-normal text-sidebar-fg-secondary hover:bg-sidebar-surface-hover hover:text-sidebar-fg data-active:font-normal data-active:text-sidebar-fg",
      },
      size: {
        // Default density for sessions, workspace parents, notes, issues, settings.
        default: "h-7 px-2 text-body [&>svg]:size-3.5",
        // Slightly denser when a surface truly needs it.
        sm: "h-6 px-1 text-body [&>svg]:size-3.5",
        // Reserved taller nav if a surface needs more hit area.
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

/**
 * List-row shell for non-menu contexts (notes tree, issue boards) and simple
 * button rows. Prefer this over hand-rolled hover/active classes.
 *
 * Defaults to a `div` so nested controls (expand, rename, delete) stay valid
 * HTML; pass `render={<button type="button" />}` for a whole-row control.
 */
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

/**
 * Truncating title inside a list row. Active weight/color mostly comes from the
 * parent `data-active` styles; this keeps a stable truncate shell for mixed
 * content (icon + label + actions).
 */
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
  /**
   * `hover` — show on any row hover/focus-within (notes delete).
   * `active-hover` — only the selected row, and only while hovered/focused
   * (issue board rename/delete).
   */
  visibility?: "hover" | "active-hover";
};

/**
 * Trailing action cluster in document flow so hover actions keep a stable
 * hit target and do not overlay the title. Visibility via `group/list-row`.
 */
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
        visibility === "active-hover" &&
          "pointer-events-none opacity-0 group-data-[active]/list-row:pointer-events-auto group-data-[active]/list-row:group-hover/list-row:opacity-100 group-data-[active]/list-row:focus-within:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

export type { SidebarListRowActionsProps, SidebarListRowOwnProps };
export { SidebarListRow, SidebarListRowActions, SidebarListRowLabel };
