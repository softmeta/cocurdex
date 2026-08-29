import { type ComponentProps, forwardRef } from "react";
import { Input } from "@/components/ui";

type SidebarRenameInputProps = Omit<ComponentProps<typeof Input>, "className">;

export const SidebarRenameInput = forwardRef<
  HTMLInputElement,
  SidebarRenameInputProps
>(function SidebarRenameInput(props, ref) {
  return (
    <Input
      className="h-7 w-full min-w-0 border-sidebar-border bg-sidebar-surface px-2 text-body text-sidebar-fg focus-visible:border-sidebar-fg-muted focus-visible:ring-0"
      ref={ref}
      {...props}
    />
  );
});
