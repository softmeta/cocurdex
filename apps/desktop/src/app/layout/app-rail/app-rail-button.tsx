import type { LucideIcon } from "lucide-react";
import type { ComponentProps } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib";

export function AppRailButton({
  active,
  icon: Icon,
  label,
  ...props
}: Omit<ComponentProps<"button">, "children" | "aria-label"> & {
  active: boolean;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            aria-current={active ? "page" : undefined}
            aria-label={label}
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-control text-sidebar-fg-muted transition-colors hover:bg-sidebar-surface-hover hover:text-sidebar-fg data-popup-open:bg-sidebar-surface-hover",
              active && "bg-sidebar-surface-active text-sidebar-fg",
            )}
            type="button"
            {...props}
          >
            <Icon className="size-4" />
          </button>
        }
      />
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
