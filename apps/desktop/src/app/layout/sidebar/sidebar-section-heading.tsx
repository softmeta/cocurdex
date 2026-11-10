import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Text } from "@/components/ui";
import {
  type SidebarSection,
  useSidebarSectionCollapse,
} from "./use-sidebar-section-collapse";

export function SidebarSectionHeading({
  actions,
  children,
  section,
}: {
  actions?: ReactNode;
  children: ReactNode;
  section: SidebarSection;
}) {
  const { collapsed, toggle } = useSidebarSectionCollapse(section);
  const heading = (
    <button
      type="button"
      aria-expanded={!collapsed}
      data-window-sticky=""
      className="group/section sticky top-0 z-10 flex w-full items-center gap-1 bg-sidebar py-1 pe-1 text-sidebar-fg-subtle hover:text-sidebar-fg"
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
  if (!actions) return heading;
  return (
    <div
      className="sticky top-0 z-10 flex w-full min-w-0 items-center bg-sidebar"
      data-window-sticky=""
    >
      <div className="min-w-0 flex-1">{heading}</div>
      <div className="-me-1.25 flex shrink-0 items-center">{actions}</div>
    </div>
  );
}
