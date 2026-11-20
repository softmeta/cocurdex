import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Text } from "@/components/ui";
import { cn } from "@/lib";

export function SidebarSectionHeader({
  title,
  collapsed,
  onToggle,
  action,
  inset = "row",
  flush = false,
}: {
  title: string;
  inset?: "row" | "toggle";
  flush?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  action?: ReactNode;
}) {
  const label = (
    <Text
      size="meta"
      weight="medium"
      className="truncate leading-none text-editor-fg-subtle"
    >
      {title}
    </Text>
  );

  return (
    <div
      className={cn(
        "group/section flex items-center justify-between gap-1 pe-0.5",
        { row: "ps-2", toggle: "ps-1.5" }[inset],
        flush && "h-4",
        !flush && "h-6 pt-2",
      )}
    >
      {onToggle ? (
        <button
          type="button"
          aria-expanded={!collapsed}
          onClick={onToggle}
          className="flex min-w-0 items-center gap-1 text-editor-fg-subtle hover:text-editor-fg"
        >
          {label}
          <ChevronRight
            className={cn(
              "size-3 shrink-0 transition-transform rtl:rotate-180",
              !collapsed &&
                "rotate-90 opacity-0 group-hover/section:opacity-100 group-has-focus-visible/section:opacity-100 rtl:rotate-90",
            )}
          />
        </button>
      ) : (
        label
      )}
      {action ? (
        <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover/section:opacity-100 focus-within:opacity-100">
          {action}
        </div>
      ) : null}
    </div>
  );
}
