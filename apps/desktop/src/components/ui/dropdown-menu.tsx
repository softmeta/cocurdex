import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { CheckIcon, ChevronRightIcon } from "lucide-react";
import type * as React from "react";
import { asChildToRender } from "@/components/ui/_as-child-render";
import { FLYOUT_GAP } from "@/components/ui/_flyout";
import {
  SubmenuAnchorProvider,
  useSubmenuAnchor,
  useSubmenuTriggerRef,
} from "@/components/ui/_submenu-anchor";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function DropdownMenu({
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Root>) {
  return <MenuPrimitive.Root {...props} />;
}

function DropdownMenuPortal({
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Portal>) {
  return <MenuPrimitive.Portal {...props} />;
}

type DropdownMenuTriggerProps = React.ComponentProps<
  typeof MenuPrimitive.Trigger
> & {
  asChild?: boolean;
};

function DropdownMenuTrigger({
  asChild,
  children,
  ...props
}: DropdownMenuTriggerProps) {
  return (
    <MenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      // biome-ignore lint/suspicious/noExplicitAny: asChildToRender returns a generic prop bag; each Base UI Trigger has its own state-typed render fn that we don't enumerate here.
      {...(asChildToRender({ asChild, children, ...props }) as any)}
    />
  );
}

type DropdownMenuContentProps = React.ComponentProps<
  typeof MenuPrimitive.Popup
> & {
  align?: React.ComponentProps<typeof MenuPrimitive.Positioner>["align"];
  side?: React.ComponentProps<typeof MenuPrimitive.Positioner>["side"];
  sideOffset?: React.ComponentProps<
    typeof MenuPrimitive.Positioner
  >["sideOffset"];
  alignOffset?: React.ComponentProps<
    typeof MenuPrimitive.Positioner
  >["alignOffset"];
};

function DropdownMenuContent({
  className,
  align = "start",
  sideOffset = 4,
  side,
  alignOffset,
  ...props
}: DropdownMenuContentProps) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        align={align}
        side={side}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        className="z-50 outline-none"
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            // No `w-*` here: auto width shrink-wraps to the longest row and
            // keeps caller `w-*` overrides working (`w-max` would sort after
            // and beat them).
            "relative z-50 max-h-(--available-height) origin-(--transform-origin) overflow-x-hidden overflow-y-auto duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-closed:overflow-hidden data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 rounded-lg bg-popover text-popover-foreground shadow-lg shadow-black/20 ring-1 ring-foreground/10 p-1 min-w-(--anchor-width) max-w-[min(var(--popup-max-width,420px),calc(100vw-2rem))]",
            className,
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

function DropdownMenuGroup({
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Group>) {
  return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Item> & {
  inset?: boolean;
  variant?: "default" | "destructive";
}) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "group/dropdown-menu-item relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground not-data-[variant=destructive]:data-highlighted:**:text-accent-foreground data-inset:ps-7 data-[variant=destructive]:text-destructive data-[variant=destructive]:data-highlighted:bg-destructive/10 data-[variant=destructive]:data-highlighted:text-destructive dark:data-[variant=destructive]:data-highlighted:bg-destructive/20 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-[variant=destructive]:*:[svg]:text-destructive",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.CheckboxItem> & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      className={cn(
        "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pe-8 ps-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-highlighted:**:text-accent-foreground data-inset:ps-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      checked={checked}
      {...props}
    >
      <span
        className="pointer-events-none absolute end-2 flex translate-y-px items-center justify-center"
        data-slot="dropdown-menu-checkbox-item-indicator"
      >
        <MenuPrimitive.CheckboxItemIndicator>
          <CheckIcon />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  );
}

function DropdownMenuRadioGroup({
  ...props
}: React.ComponentProps<typeof MenuPrimitive.RadioGroup>) {
  return (
    <MenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      {...props}
    />
  );
}

function DropdownMenuRadioItem({
  className,
  children,
  inset,
  // Base UI defaults RadioItem closeOnClick to false (stay open while
  // comparing options). Our menus are pick-and-done (agent, mode, …), so
  // close after select like a regular MenuItem. Pass closeOnClick={false}
  // when a settings-style menu should stay open.
  closeOnClick = true,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.RadioItem> & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      closeOnClick={closeOnClick}
      className={cn(
        "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pe-8 ps-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-highlighted:**:text-accent-foreground data-inset:ps-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <span
        className="pointer-events-none absolute end-2 flex translate-y-px items-center justify-center"
        data-slot="dropdown-menu-radio-item-indicator"
      >
        <MenuPrimitive.RadioItemIndicator>
          <CheckIcon />
        </MenuPrimitive.RadioItemIndicator>
      </span>
      {children}
    </MenuPrimitive.RadioItem>
  );
}

// Base UI's Menu has no standalone Label primitive — GroupLabel is for use
// inside Menu.Group. We expose it under the radix-style name for API parity.
function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.GroupLabel> & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        "px-1.5 py-1 text-xs font-medium text-muted-foreground data-inset:ps-7",
        className,
      )}
      {...props}
    />
  );
}

// Base UI's Menu has no Separator primitive — render a plain divider.
function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "ms-auto text-xs tracking-widest text-muted-foreground group-data-highlighted/dropdown-menu-item:text-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSub({
  ...props
}: React.ComponentProps<typeof MenuPrimitive.SubmenuRoot>) {
  return (
    <SubmenuAnchorProvider>
      <MenuPrimitive.SubmenuRoot {...props} />
    </SubmenuAnchorProvider>
  );
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: Omit<React.ComponentProps<typeof MenuPrimitive.SubmenuTrigger>, "ref"> & {
  inset?: boolean;
}) {
  const triggerRef = useSubmenuTriggerRef();
  return (
    <MenuPrimitive.SubmenuTrigger
      ref={triggerRef}
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        // Match DropdownMenuItem spacing so a sub-row sits flush with sibling
        // items; keep the chevron pinned to the trailing edge.
        "flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground not-data-[variant=destructive]:data-highlighted:**:text-accent-foreground data-inset:ps-7 data-open:bg-accent data-open:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ms-auto size-3.5 shrink-0 text-muted-foreground" />
    </MenuPrimitive.SubmenuTrigger>
  );
}

type DropdownMenuSubContentProps = React.ComponentProps<
  typeof MenuPrimitive.Popup
> & {
  align?: React.ComponentProps<typeof MenuPrimitive.Positioner>["align"];
  side?: React.ComponentProps<typeof MenuPrimitive.Positioner>["side"];
  sideOffset?: React.ComponentProps<
    typeof MenuPrimitive.Positioner
  >["sideOffset"];
  alignOffset?: React.ComponentProps<
    typeof MenuPrimitive.Positioner
  >["alignOffset"];
};

function DropdownMenuSubContent({
  className,
  sideOffset = FLYOUT_GAP,
  // Nudge up slightly so the first row of the submenu lines up with the
  // sub-trigger row (classic menu flyout alignment).
  alignOffset = -4,
  align = "start",
  side,
  ...props
}: DropdownMenuSubContentProps) {
  const anchor = useSubmenuAnchor();
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        className="z-50 outline-none"
        side={side}
        sideOffset={sideOffset}
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-sub-content"
          className={cn(
            // Mirror DropdownMenuContent: allow vertical scroll, keep a clear
            // elevated surface so the flyout reads as a separate panel.
            "z-50 max-h-(--available-height) origin-(--transform-origin) overflow-x-hidden overflow-y-auto duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-closed:overflow-hidden data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 rounded-lg bg-popover text-popover-foreground shadow-lg shadow-black/20 ring-1 ring-foreground/10 p-1 max-w-[min(var(--popup-max-width,420px),calc(100vw-2rem))]",
            className,
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

function DropdownMenuSearchInput({
  className,
  onKeyDown,
  ...props
}: React.ComponentProps<typeof Input>) {
  return (
    <Input
      autoFocus
      className={cn("mb-1 h-8 shrink-0", className)}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.key !== "Escape") event.stopPropagation();
      }}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSearchInput,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
};
