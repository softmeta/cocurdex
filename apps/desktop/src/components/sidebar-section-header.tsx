import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Text } from "@/components/ui";
import { cn } from "@/lib";

export function SidebarSectionHeader({
  title,
  collapsed,
  onToggle,
  action,
}: {
  title: string;
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
    <div className="group/section flex h-6 items-center justify-between gap-1 ps-2 pe-1 pt-2">
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
              "size-3 shrink-0 opacity-0 transition-transform group-hover/section:opacity-100 rtl:rotate-180",
              !collapsed && "rotate-90 rtl:rotate-90",
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
