import { Briefcase, ChevronDown, Contact, MessageCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppDropdownRadioList } from "@/components/app";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui";
import type { SidebarTab } from "./sidebar-tab-store";

export function SidebarFormSwitcher({
  value,
  onValueChange,
}: {
  value: SidebarTab;
  onValueChange(value: SidebarTab): void;
}) {
  const { t } = useTranslation(["sessions", "chat", "personal"]);
  const options = [
    {
      value: "workspaces",
      label: t("sessions:sidebar.workspacesGroup"),
      icon: <Briefcase className="size-3.5" />,
    },
    {
      value: "chat",
      label: t("chat:sidebar.title"),
      icon: <MessageCircle className="size-3.5" />,
    },
    {
      value: "personal",
      label: t("personal:sidebar.title"),
      icon: <Contact className="size-3.5" />,
    },
  ] as const;
  const current = options.find((option) => option.value === value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("sessions:sidebar.switchForm", {
          name: current?.label ?? "",
        })}
        className="flex h-7 min-w-0 items-center gap-1 rounded-control ps-1.5 pe-1 text-body font-medium text-sidebar-fg transition-colors hover:bg-sidebar-surface-hover data-popup-open:bg-sidebar-surface-hover"
      >
        <span className="truncate">{current?.label}</span>
        <ChevronDown className="size-3.5 shrink-0 text-sidebar-fg-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <AppDropdownRadioList
          onValueChange={(next) => onValueChange(next as SidebarTab)}
          options={options}
          value={value}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
