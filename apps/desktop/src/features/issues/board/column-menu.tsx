import { useSetAtom } from "jotai";
import { Ellipsis, Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TitlebarIconButton } from "@/app/layout/titlebar-icon-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui";
import { issueStatusesDialogOpenAtom } from "../statuses/issue-statuses-dialog-store";

export function ColumnMenu() {
  const { t } = useTranslation("issues");
  const openStatuses = useSetAtom(issueStatusesDialogOpenAtom);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <TitlebarIconButton aria-label={t("board.columnMenu")}>
          <Ellipsis className="size-3.5" />
        </TitlebarIconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuItem onClick={() => openStatuses(true)}>
          <Settings2 className="size-3.5" />
          {t("board.manageStatuses")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
