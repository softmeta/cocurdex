import { ChevronDown } from "lucide-react";
import type * as React from "react";
import { Button, DropdownMenuContent, DropdownMenuItem } from "@/components/ui";
import { cn } from "@/lib";

export type AppDropdownTriggerAppearance = "ghost" | "outline";

const dropdownTriggerClassName = cn(
  "group h-8 min-w-0 justify-between gap-2 px-2.5 text-body font-medium text-muted-foreground shadow-none transition-colors hover:text-accent-foreground data-[state=open]:text-accent-foreground disabled:cursor-default disabled:opacity-60",
);

const dropdownTriggerAppearanceClassNames = {
  ghost: cn(
    "border-transparent bg-transparent hover:bg-accent data-[state=open]:bg-accent",
  ),
  outline: cn(
    "border-border/70 bg-background/65 hover:bg-accent data-[state=open]:bg-accent",
  ),
} satisfies Record<AppDropdownTriggerAppearance, string>;

/** `control` matches form/select chrome; `full` is for true pills/chips only. */
export type AppDropdownTriggerRadius = "control" | "full";

const dropdownTriggerRadiusClassNames = {
  control: "rounded-control",
  full: "rounded-full",
} satisfies Record<AppDropdownTriggerRadius, string>;

// Shared by AppDropdown and AppSearchableSelect: grow with the longest
// label, stay at least as wide as the (often truncated) trigger, and cap
// so an 80-char ref cannot stretch across the window.
export const appPopupContentWidthClassName =
  "w-max min-w-[var(--anchor-width)] max-w-[min(420px,calc(100vw-2rem))]";

export const appDropdownContentClassName = cn(
  appPopupContentWidthClassName,
  "rounded-control! border-border/70 bg-popover p-1 text-popover-foreground shadow-lg shadow-black/20",
  // Keep a hair of space between consecutive rows so an adjacent selected +
  // hovered pair reads as two filled rows, not one merged block.
  // Deliberately NOT an adjacent-sibling selector: an open submenu trigger gets
  // Base UI focus guards injected right after it, which are position:fixed (zero
  // layout) but still break `menuitem + menuitem`, so the row below lost its
  // margin and the whole popup jumped 2px while hovering. Reset after separators
  // so their own margin stays the only gap there.
  "[&_[role=menuitem]:not(:first-child)]:mt-0.5 [&_[data-slot=dropdown-menu-separator]+[role=menuitem]]:mt-0",
);

// Tightens row spacing for menus that pack several short rows (composer
// agent / permission / attach menus) without changing the shared defaults.
// overflow-hidden replaces the base overflow-y-auto: these menus are always a
// few short rows, and the auto box showed a phantom 1px scrollbar from subpixel
// row rounding (scrollHeight ceils above clientHeight). The clipped 1px is empty
// padding, never content. The override is scoped via the data-slot attribute so
// it outranks the single-class base utility on specificity — cn() is clsx (no
// tailwind-merge), so class-string order alone won't win. The separator is
// tagged by data-slot, not role, so target that for the tightened margin.
export const compactDropdownContentClassName = cn(
  "[&[data-slot=dropdown-menu-content]]:overflow-hidden p-0.5 [&_[role=menuitem]]:gap-1.5 [&_[role=menuitem]]:px-2 [&_[role=menuitem]]:py-1 [&_[data-slot=dropdown-menu-separator]]:my-0.5",
);

export const appDropdownItemClassName = cn(
  "flex cursor-pointer items-center gap-2 rounded-control px-2.5 py-2 text-body text-muted-foreground focus:bg-accent focus:text-accent-foreground",
);

// Prefer AppSelect for single-select; this fill is only for rare
// action-menu rows that still pass `selected` on AppDropdownItem.
export const appDropdownSelectedItemClassName =
  "bg-accent text-accent-foreground";

export const appDropdownSeparatorClassName = "my-1 bg-border/70";

type AppDropdownTriggerButtonProps = React.ComponentProps<"button"> & {
  appearance?: AppDropdownTriggerAppearance;
  /** Default `control`. Use `full` only for true pill/chip triggers. */
  radius?: AppDropdownTriggerRadius;
  chevronClassName?: string;
  showChevron?: boolean;
};

export function AppDropdownTriggerButton({
  appearance = "outline",
  radius = "control",
  children,
  className,
  chevronClassName,
  showChevron = true,
  type = "button",
  ...props
}: AppDropdownTriggerButtonProps) {
  return (
    <Button
      className={cn(
        dropdownTriggerClassName,
        dropdownTriggerRadiusClassNames[radius],
        dropdownTriggerAppearanceClassNames[appearance],
        className,
      )}
      size="sm"
      type={type}
      variant={appearance === "ghost" ? "ghost" : "outline"}
      {...props}
    >
      {children}
      {showChevron ? (
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-accent-foreground",
            chevronClassName,
          )}
        />
      ) : null}
    </Button>
  );
}

export function AppDropdownTriggerLabel({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return <span className={cn("min-w-0 truncate", className)} {...props} />;
}

export function AppDropdownContent({
  align = "start",
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuContent>) {
  return (
    <DropdownMenuContent
      align={align}
      className={cn(appDropdownContentClassName, className)}
      {...props}
    />
  );
}

type AppDropdownItemProps = React.ComponentProps<typeof DropdownMenuItem> & {
  selected?: boolean;
};

export function AppDropdownItem({
  className,
  selected = false,
  ...props
}: AppDropdownItemProps) {
  return (
    <DropdownMenuItem
      className={cn(
        appDropdownItemClassName,
        selected && appDropdownSelectedItemClassName,
        className,
      )}
      {...props}
    />
  );
}
