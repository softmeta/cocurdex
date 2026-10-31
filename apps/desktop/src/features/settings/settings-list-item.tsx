import type { ReactNode } from "react";
import { cn } from "@/lib";

export function SettingsListItem({
  isActive,
  subtitle,
  title,
  trailing,
  dataAttributes,
  onClick,
}: {
  isActive: boolean;
  subtitle: string;
  title: string;
  trailing?: ReactNode;
  dataAttributes?: Record<`data-${string}`, string>;
  onClick(): void;
}) {
  return (
    <button
      aria-pressed={isActive}
      className={cn(
        "flex w-full flex-col items-start gap-0.5 rounded-control px-3 py-2 text-start transition-colors",
        isActive && "bg-settings-surface-active font-medium text-foreground",
        !isActive &&
          "bg-settings-surface text-foreground hover:bg-settings-surface-hover",
      )}
      type="button"
      onClick={onClick}
      {...dataAttributes}
    >
      <span className="flex w-full items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-body font-medium">
          {title}
        </span>
        {trailing}
      </span>
      <span className="w-full truncate text-2xs text-muted-foreground/70">
        {subtitle}
      </span>
    </button>
  );
}
