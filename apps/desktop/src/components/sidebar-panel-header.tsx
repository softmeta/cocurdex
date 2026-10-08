import type { ReactNode } from "react";
import { Text } from "@/components/ui";
import { SidebarPanelToggle } from "./sidebar-panel-toggle";

export const WORKBENCH_SIDEBAR_WIDTH_PX = 220;

export function SidebarPanelHeader({
  title,
  collapseLabel,
  onCollapse,
  action,
}: {
  title: string;
  collapseLabel: string;
  onCollapse: () => void;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-6 shrink-0 items-center justify-between gap-1 px-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <SidebarPanelToggle onClick={onCollapse} aria-label={collapseLabel} />
        <Text
          size="meta"
          weight="medium"
          className="truncate leading-none text-editor-fg-subtle"
        >
          {title}
        </Text>
      </div>
      {action}
    </div>
  );
}
