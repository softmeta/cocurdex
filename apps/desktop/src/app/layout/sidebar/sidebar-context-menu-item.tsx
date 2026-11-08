import type { LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { ContextMenuItem } from "@/components/ui";

type SidebarContextMenuItemProps = Omit<
  ComponentProps<typeof ContextMenuItem>,
  "children" | "variant"
> & {
  children: ReactNode;
  destructive?: boolean;
  icon: LucideIcon;
};

export function SidebarContextMenuItem({
  children,
  destructive = false,
  icon: Icon,
  ...props
}: SidebarContextMenuItemProps) {
  return (
    <ContextMenuItem
      variant={destructive ? "destructive" : "default"}
      {...props}
    >
      <Icon className="size-3.5" />
      {children}
    </ContextMenuItem>
  );
}
