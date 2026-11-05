import { useAtomValue } from "jotai";
import { ListFilter } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppSidebarIconButton } from "@/components/app";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui";
import {
  isCustomizedSessionListView,
  sessionListViewAtom,
} from "@/features/sessions/session-list-view";
import type { SessionListViewMenuContentProps } from "./session-list-view-menu-content";
import { SessionListViewMenuContent } from "./session-list-view-menu-content-lazy";

export function SessionListViewMenu(props: SessionListViewMenuContentProps) {
  const { t } = useTranslation("sessions");
  const view = useAtomValue(sessionListViewAtom);
  const menuLabel = t("sidebar.view.menu");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<AppSidebarIconButton aria-label={menuLabel} size="sm" />}
      >
        <ListFilter className="size-3.5" />
        {isCustomizedSessionListView(view) ? (
          <span className="absolute end-1 top-1 size-1.5 rounded-full bg-sidebar-primary" />
        ) : null}
      </DropdownMenuTrigger>
      <SessionListViewMenuContent {...props} />
    </DropdownMenu>
  );
}
