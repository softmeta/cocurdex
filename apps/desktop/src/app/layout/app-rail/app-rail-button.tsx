import type { LucideIcon } from "lucide-react";
import { forwardRef } from "react";
import {
  AppRailIconButton,
  type AppRailIconButtonProps,
} from "@/components/app";

export const AppRailButton = forwardRef<
  HTMLButtonElement,
  Omit<AppRailIconButtonProps, "children" | "aria-label"> & {
    icon: LucideIcon;
    label: string;
  }
>(function AppRailButton({ icon: Icon, label, ...props }, ref) {
  return (
    <AppRailIconButton ref={ref} aria-label={label} {...props}>
      <Icon className="size-4" />
    </AppRailIconButton>
  );
});
