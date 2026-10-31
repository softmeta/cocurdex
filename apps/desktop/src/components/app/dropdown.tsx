import { ChevronDown } from "lucide-react";
import type * as React from "react";
import { Button, DropdownMenuContent, DropdownMenuItem } from "@/components/ui";
import { cn } from "@/lib";

export type AppDropdownTriggerAppearance = "ghost" | "outline";

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
        "group h-7 min-w-0 justify-between gap-2 px-2.5 text-body font-medium text-muted-foreground shadow-none transition-colors hover:text-accent-foreground data-[state=open]:text-accent-foreground disabled:cursor-default disabled:opacity-60",
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
            "size-3.5 shrink-0 translate-y-px text-muted-foreground transition-colors group-hover:text-accent-foreground",
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
  return <DropdownMenuContent align={align} className={className} {...props} />;
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
        "cursor-pointer",
        selected && "bg-accent text-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}
