import type { ReactNode } from "react";
import { Text } from "@/components/ui";

export function SidebarPanelHeader({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-8 shrink-0 items-center justify-between gap-1 ps-2 pe-0.5">
      <Text
        size="meta"
        weight="medium"
        className="min-w-0 truncate leading-none text-editor-fg-subtle"
      >
        {title}
      </Text>
      {action}
    </div>
  );
}
