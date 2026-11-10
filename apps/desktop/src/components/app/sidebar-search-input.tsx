import { Search } from "lucide-react";
import type { ComponentProps } from "react";

export function SidebarSearchInput(
  props: Omit<ComponentProps<"input">, "className" | "type">,
) {
  return (
    <label className="flex h-7 w-full min-w-0 cursor-text items-center gap-1.5 rounded-control bg-sidebar-surface-hover px-2 text-sidebar-fg-muted transition-colors focus-within:bg-sidebar-surface-active focus-within:text-sidebar-fg-secondary">
      <Search aria-hidden className="size-3.5 shrink-0" />
      <input
        {...props}
        className="min-w-0 flex-1 bg-transparent text-body leading-5 text-sidebar-fg outline-none placeholder:text-sidebar-fg-muted"
        type="text"
      />
    </label>
  );
}
