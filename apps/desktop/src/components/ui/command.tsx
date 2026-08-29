import { Autocomplete } from "@base-ui/react/autocomplete";
import { SearchIcon } from "lucide-react";
import type * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Thin compatibility shell that preserves cmdk's component API surface but is
// powered by Base UI's `Autocomplete` (action-based combobox). The shell
// always runs in `inline` mode — the list renders without a popup, matching
// cmdk's behavior of being a standalone palette/menu container.
//
// Filtering is intentionally *not* delegated to Autocomplete: cmdk used per-
// item `value` strings for fuzzy filtering, an idiom that doesn't map cleanly
// onto Base UI's `items`-prop model. Callers do their own filtering and pass
// the result as `children`. The shell keeps keyboard navigation and the
// `data-highlighted` state from Base UI.

type CommandProps = Omit<React.ComponentProps<"div">, "ref" | "onSelect"> & {
  ref?: React.Ref<HTMLDivElement>;
  /** Accepted for parity with cmdk; the shell never auto-filters. */
  filter?: (...args: unknown[]) => number | boolean;
  /** Accepted for parity with cmdk; the shell never auto-filters. */
  shouldFilter?: boolean;
  /**
   * Forwarded to Base UI. Defaults to the menu-style "always" highlight, but
   * callers that drive their own selection state should pass `false` to stop
   * Base UI from claiming a row (its `data-highlighted` would otherwise fight
   * the caller's own highlight styling).
   */
  autoHighlight?: boolean | "always";
};

function Command({
  className,
  children,
  ref,
  filter: _filter,
  shouldFilter: _shouldFilter,
  autoHighlight = "always",
  ...props
}: CommandProps) {
  return (
    <Autocomplete.Root inline mode="none" autoHighlight={autoHighlight}>
      <div
        ref={ref}
        data-slot="command"
        className={cn(
          "flex size-full flex-col overflow-hidden rounded-xl! bg-popover p-1 text-popover-foreground",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </Autocomplete.Root>
  );
}

function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  className,
  showCloseButton = false,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  title?: string;
  description?: string;
  className?: string;
  showCloseButton?: boolean;
}) {
  return (
    <Dialog {...props}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogContent
        className={cn(
          "top-1/3 translate-y-0 overflow-hidden rounded-xl! p-0",
          className,
        )}
        showCloseButton={showCloseButton}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

type CommandInputProps = Omit<
  React.ComponentProps<typeof Autocomplete.Input>,
  "value" | "defaultValue" | "onValueChange"
> & {
  value?: string;
  /** cmdk-style controlled value change. */
  onValueChange?: (value: string) => void;
};

function CommandInput({
  className,
  value,
  onValueChange,
  ...props
}: CommandInputProps) {
  return (
    <div
      data-slot="command-input-wrapper"
      className="mb-0.5 flex h-7 items-center gap-2 px-2"
    >
      <SearchIcon className="size-3.5 shrink-0 opacity-50" />
      <Autocomplete.Input
        data-slot="command-input"
        className={cn(
          "h-full w-full bg-transparent text-body outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        value={value}
        onChange={(event) => onValueChange?.(event.currentTarget.value)}
        {...props}
      />
    </div>
  );
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof Autocomplete.List>) {
  return (
    <Autocomplete.List
      data-slot="command-list"
      className={cn(
        "scrollbar-hide flex max-h-72 scroll-py-1 flex-col gap-0.5 overflow-x-hidden overflow-y-auto outline-none",
        className,
      )}
      {...props}
    />
  );
}

// Plain wrapper — callers gate visibility themselves (we don't use
// Autocomplete.Empty because it requires the `items` prop on Root).
function CommandEmpty({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="command-empty"
      className={cn("py-6 text-center text-body", className)}
      {...props}
    />
  );
}

type CommandGroupProps = Omit<
  React.ComponentProps<typeof Autocomplete.Group>,
  "children"
> & {
  heading?: React.ReactNode;
  children?: React.ReactNode;
};

function CommandGroup({
  className,
  heading,
  children,
  ...props
}: CommandGroupProps) {
  return (
    <Autocomplete.Group
      data-slot="command-group"
      className={cn(
        "flex shrink-0 flex-col gap-0.5 overflow-hidden p-1 text-foreground **:[[data-slot=command-group-heading]]:px-2 **:[[data-slot=command-group-heading]]:pt-0 **:[[data-slot=command-group-heading]]:pb-1.5 **:[[data-slot=command-group-heading]]:text-meta **:[[data-slot=command-group-heading]]:font-medium **:[[data-slot=command-group-heading]]:text-muted-foreground",
        className,
      )}
      {...props}
    >
      {heading != null ? (
        <Autocomplete.GroupLabel data-slot="command-group-heading">
          {heading}
        </Autocomplete.GroupLabel>
      ) : null}
      {children}
    </Autocomplete.Group>
  );
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      data-slot="command-separator"
      className={cn("-mx-1 h-px bg-border", className)}
      {...props}
    />
  );
}

type CommandItemProps = Omit<
  React.ComponentProps<typeof Autocomplete.Item>,
  "onSelect"
> & {
  /** cmdk-style action callback. Translated to onClick internally. */
  onSelect?: (value: string) => void;
  /**
   * Marks the row as the currently selected value, giving it a persistent
   * highlight so an opened menu visibly lands on the active option (distinct
   * from Base UI's transient keyboard `data-highlighted`).
   */
  selected?: boolean;
};

function CommandItem({
  className,
  children,
  onSelect,
  onClick,
  value,
  selected,
  ...props
}: CommandItemProps) {
  return (
    <Autocomplete.Item
      data-slot="command-item"
      data-selected={selected || undefined}
      value={value}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        onSelect?.(typeof value === "string" ? value : "");
      }}
      className={cn(
        // Selected = persistent check (via children), not a solid fill — keeps
        // parity with DropdownMenuRadioItem. Highlight is hover/keyboard only.
        "group/command-item relative flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1 text-body outline-hidden select-none in-data-[slot=dialog-content]:rounded-lg! data-disabled:pointer-events-none data-disabled:opacity-50 data-selected:font-medium data-selected:text-foreground data-highlighted:bg-muted data-highlighted:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 data-highlighted:*:[svg]:text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </Autocomplete.Item>
  );
}

function CommandShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        "ms-auto text-xs tracking-widest text-muted-foreground group-data-highlighted/command-item:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
};
