import type { CSSProperties, MouseEvent } from "react";
import { cn } from "@/lib";

/**
 * Vertical 1px chrome separator with a 7px centered hit target and hover
 * brighten. Shared by app shell columns, editor explorer, notes/issues, PDF
 * rails, and chat dock width handles.
 *
 * - `relative`: flex sibling between panels (default)
 * - `absolute-start` / `absolute-end`: overlay on a panel's logical edge
 */
export type ResizeSeparatorPosition =
  | "relative"
  | "absolute-start"
  | "absolute-end";

export function ResizeSeparator({
  ariaLabel,
  testId,
  onMouseDown,
  position = "relative",
  className,
  style,
}: {
  ariaLabel: string;
  testId?: string;
  onMouseDown(event: MouseEvent): void;
  position?: ResizeSeparatorPosition;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn(
        "w-px bg-chrome-separator",
        position === "relative" && "relative z-10 shrink-0",
        position === "absolute-start" && "absolute inset-y-0 start-0 z-10",
        position === "absolute-end" && "absolute inset-y-0 end-0 z-10",
        className,
      )}
      style={style}
    >
      {/* biome-ignore lint/a11y/useSemanticElements: a splitter wraps its hover line, which an <hr> cannot contain. */}
      <div
        aria-label={ariaLabel}
        aria-orientation="vertical"
        className="group absolute inset-y-0 left-1/2 w-[7px] -translate-x-1/2 cursor-col-resize"
        data-testid={testId}
        role="separator"
        onMouseDown={onMouseDown}
      >
        <div className="mx-auto h-full w-px bg-chrome-separator transition-[width,background-color] duration-150 group-hover:w-[3px] group-hover:bg-chrome-separator-hover" />
      </div>
    </div>
  );
}
