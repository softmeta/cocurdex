import { type ReactNode, useCallback, useRef, useState } from "react";
import { cn } from "@/lib";
import { ResizeSeparator } from "./resize-separator";
import { beginColumnResize } from "./use-column-resize";

interface ResizableSidebarProps {
  children: ReactNode;
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
  width?: number;
  onWidthChange?(width: number): void;
  onWidthCommit?(width: number): void;
  ariaLabel: string;
  surface?: "editor" | "sidebar";
  className?: string;
}

export const WORKBENCH_SIDEBAR_WIDTH_PX = 220;

export function ResizableSidebar({
  children,
  defaultWidth,
  minWidth = 180,
  maxWidth = 480,
  ariaLabel,
  surface = "editor",
  className,
  width: controlledWidth,
  onWidthChange,
  onWidthCommit,
}: ResizableSidebarProps) {
  const [localWidth, setLocalWidth] = useState(defaultWidth);
  const width = controlledWidth ?? localWidth;
  const setWidth = onWidthChange ?? setLocalWidth;
  const widthRef = useRef(width);
  widthRef.current = width;

  const handleMouseDown = useCallback(
    (event: React.MouseEvent) => {
      beginColumnResize(event, {
        edge: "inline-end",
        startWidth: widthRef.current,
        clamp: (next) => Math.min(maxWidth, Math.max(minWidth, next)),
        onWidthChange: setWidth,
        onDragEnd: onWidthCommit,
      });
    },
    [minWidth, maxWidth, setWidth, onWidthCommit],
  );

  return (
    <>
      <div
        className={cn(
          "flex min-h-0 min-w-0 shrink-0 flex-col overflow-hidden",
          { editor: "bg-editor-shell", sidebar: "bg-sidebar" }[surface],
          className,
        )}
        data-window-sidebar={surface === "sidebar" ? "" : undefined}
        style={{ width }}
      >
        {children}
      </div>
      {surface === "sidebar" ? (
        <div
          className="relative z-10 flex shrink-0 bg-sidebar"
          data-window-sidebar-edge=""
        >
          <ResizeSeparator
            ariaLabel={ariaLabel}
            line="hover"
            onMouseDown={handleMouseDown}
          />
        </div>
      ) : (
        <ResizeSeparator ariaLabel={ariaLabel} onMouseDown={handleMouseDown} />
      )}
    </>
  );
}
