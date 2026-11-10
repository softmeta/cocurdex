import { Search, X } from "lucide-react";
import type { ComponentProps } from "react";
import { IconButton } from "@/components/ui/icon-button";

export function SidebarSearchInput({
  clearLabel,
  onClear,
  value,
  ...props
}: Omit<ComponentProps<"input">, "className" | "type" | "value"> & {
  clearLabel: string;
  value: string;
  onClear(): void;
}) {
  return (
    <div className="flex h-7 w-full min-w-0 items-center gap-1.5 rounded-control bg-sidebar-surface-hover px-2 text-sidebar-fg-muted transition-colors focus-within:bg-sidebar-surface-active focus-within:text-sidebar-fg-secondary">
      <Search aria-hidden className="size-3.5 shrink-0" />
      <input
        {...props}
        className="h-full min-w-0 flex-1 bg-transparent text-body leading-5 text-sidebar-fg outline-none placeholder:text-sidebar-fg-muted"
        type="text"
        value={value}
      />
      {value ? (
        <IconButton
          aria-label={clearLabel}
          className="-me-1.5 shrink-0 text-sidebar-fg-muted hover:text-sidebar-fg"
          size="xs"
          onClick={(event) => {
            onClear();
            event.currentTarget.parentElement?.querySelector("input")?.focus();
          }}
        >
          <X className="size-3.5" />
        </IconButton>
      ) : null}
    </div>
  );
}
