import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Text } from "@/components/ui";
import {
  type SidebarSection,
  useSidebarSectionCollapse,
} from "./use-sidebar-section-collapse";

export function SidebarSectionHeading({
  children,
  section,
}: {
  children: ReactNode;
  section: SidebarSection;
}) {
  const { collapsed, toggle } = useSidebarSectionCollapse(section);
  return (
    <button
      type="button"
      aria-expanded={!collapsed}
      className="group/section sticky top-0 z-10 flex w-full items-center gap-1 bg-sidebar px-1 py-1 text-sidebar-fg-subtle hover:text-sidebar-fg"
      onClick={toggle}
    >
      <Text size="meta">{children}</Text>
      {collapsed ? (
        <ChevronRight className="size-3 shrink-0 rtl:-scale-x-100" />
      ) : (
        <ChevronDown className="hidden size-3 shrink-0 group-hover/section:block group-focus-visible/section:block" />
      )}
    </button>
  );
}
