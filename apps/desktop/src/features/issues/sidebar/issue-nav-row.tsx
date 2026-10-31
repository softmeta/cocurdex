import type { LucideIcon } from "lucide-react";
import { SidebarListRow, SidebarListRowLabel, Text } from "@/components/ui";
import { cn } from "@/lib";

export function IssueNavRow({
  icon: Icon,
  label,
  isActive,
  indent = false,
  count,
  onSelect,
}: {
  icon: LucideIcon;
  label: string;
  isActive: boolean;
  indent?: boolean;
  count?: number;
  onSelect: () => void;
}) {
  return (
    <SidebarListRow
      isActive={isActive}
      render={<button type="button" />}
      className={cn(indent && "ps-7")}
      onClick={onSelect}
    >
      <Icon className="size-3.5 shrink-0 text-sidebar-fg-muted" />
      <SidebarListRowLabel>{label}</SidebarListRowLabel>
      {count ? (
        <Text size="meta" tone="muted" className="shrink-0 tabular-nums">
          {count}
        </Text>
      ) : null}
    </SidebarListRow>
  );
}
