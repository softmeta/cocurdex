import { SquarePen } from "lucide-react";
import { TitlebarIconButton } from "../titlebar-icon-button";
import { useSidebarCreateActions } from "./use-sidebar-create-actions";

export function SidebarCreateButton() {
  const { create } = useSidebarCreateActions();
  return (
    <TitlebarIconButton
      aria-label={create.label}
      cursor="default"
      onClick={create.run}
      tooltip={create.label}
    >
      <SquarePen className="size-3.5" />
    </TitlebarIconButton>
  );
}
