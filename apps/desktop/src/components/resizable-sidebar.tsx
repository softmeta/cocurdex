import { type ReactNode, useCallback, useRef, useState } from "react";
import { cn } from "@/lib";
import { ResizeSeparator } from "./resize-separator";
import { beginColumnResize } from "./use-column-resize";

interface ResizableSidebarProps {
  children: ReactNode;
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
  ariaLabel: string;
  className?: string;
}

export const WORKBENCH_SIDEBAR_WIDTH_PX = 220;

export function ResizableSidebar({
  children,
  defaultWidth,
  minWidth = 180,
  maxWidth = 480,
  ariaLabel,
  className,
}: ResizableSidebarProps) {
  const [width, setWidth] = useState(defaultWidth);
  const widthRef = useRef(width);
  widthRef.current = width;

  const handleMouseDown = useCallback(
    (event: React.MouseEvent) => {
      beginColumnResize(event, {
        edge: "inline-end",
        startWidth: widthRef.current,
        clamp: (next) => Math.min(maxWidth, Math.max(minWidth, next)),
        onWidthChange: setWidth,
      });
    },
    [minWidth, maxWidth],
  );

  return (
    <>
      <div
        className={cn(
          "flex min-h-0 min-w-0 shrink-0 flex-col overflow-hidden bg-editor-shell",
          className,
        )}
        style={{ width }}
      >
        {children}
      </div>
      <ResizeSeparator ariaLabel={ariaLabel} onMouseDown={handleMouseDown} />
    </>
  );
}
