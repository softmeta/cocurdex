import type { ReactNode } from "react";
import { Text } from "@/components/ui";
import { SidebarToggleButton } from "./titlebar-icon-button";

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
    <div className="flex h-8 shrink-0 items-center justify-between gap-1 pe-0.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <SidebarToggleButton label={collapseLabel} open onToggle={onCollapse} />
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
