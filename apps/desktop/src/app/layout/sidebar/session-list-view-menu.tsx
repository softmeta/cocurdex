import { useAtomValue } from "jotai";
import { ListFilter } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
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
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              aria-label={menuLabel}
              className="relative flex size-7 shrink-0 items-center justify-center rounded-control text-sidebar-fg-muted transition-colors hover:bg-sidebar-surface-hover hover:text-sidebar-fg data-popup-open:bg-sidebar-surface-hover"
            />
          }
        >
          <ListFilter className="size-3.5" />
          {isCustomizedSessionListView(view) ? (
            <span className="absolute end-1 top-1 size-1.5 rounded-full bg-sidebar-primary" />
          ) : null}
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {menuLabel}
        </TooltipContent>
      </Tooltip>
      <SessionListViewMenuContent {...props} />
    </DropdownMenu>
  );
}
