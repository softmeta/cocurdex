import type { ReactNode } from "react";
import { cn } from "@/lib";

export function AppWindowOverlayHeader({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "app-drag flex h-8 shrink-0 items-center gap-2 border-b pr-[calc(0.75rem+var(--titlebar-controls-inset))] pl-3 [html[data-traffic-lights]_&]:pl-20",
        className,
      )}
    >
      {children}
    </div>
  );
}
