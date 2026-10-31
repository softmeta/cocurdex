import type { HTMLAttributes } from "react";
import { cn } from "@/lib";

export function PanelToolbar({
  divided = true,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { divided?: boolean }) {
  return (
    <div
      className={cn(
        "box-content flex h-8 shrink-0 items-center px-2",
        divided && "border-b border-editor-border",
        className,
      )}
      {...props}
    />
  );
}
