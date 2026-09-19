import {
  Ellipsis,
  Square,
  SquareSplitHorizontal,
  SquareSplitVertical,
  X,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AppDropdownContent,
  AppDropdownItem,
  compactDropdownContentClassName,
} from "@/components";
import {
  DropdownMenu,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui";
import { useCanSplitSessionPane } from "@/features/sessions";
import { ChatWindowMenuItem } from "../chat-window";
import {
  TITLEBAR_ICON_GLYPH_CLASS,
  TitlebarIconButton,
} from "../titlebar-icon-button";

interface SessionSplitMenuProps {
  canClose: boolean;
  paneId: string;
  onClose?(): void;
  onCloseAll?(): void;
  onSplitDown(): void;
  onSplitRight(): void;
}

export function SessionSplitMenu({
  canClose,
  paneId,
  onClose,
  onCloseAll,
  onSplitDown,
  onSplitRight,
}: SessionSplitMenuProps) {
  const { t } = useTranslation("sessions");
  const [open, setOpen] = useState(false);
  const canSplitDown = useCanSplitSessionPane(paneId, "down");
  const canSplitRight = useCanSplitSessionPane(paneId, "right");

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <TitlebarIconButton
          active={open}
          aria-expanded={open}
          aria-label={t("split.menu")}
          cursor="default"
        >
          <Ellipsis className={TITLEBAR_ICON_GLYPH_CLASS} />
        </TitlebarIconButton>
      </DropdownMenuTrigger>
      <AppDropdownContent
        align="start"
        className={compactDropdownContentClassName}
        side="bottom"
      >
        <AppDropdownItem disabled={!canSplitDown} onClick={onSplitDown}>
          <SquareSplitHorizontal className="size-4" />
          {t("split.down")}
        </AppDropdownItem>
        <AppDropdownItem disabled={!canSplitRight} onClick={onSplitRight}>
          <SquareSplitVertical className="size-4" />
          {t("split.right")}
        </AppDropdownItem>
        <DropdownMenuSeparator />
        <ChatWindowMenuItem />
        {canClose && onClose && onCloseAll ? (
          <>
            <DropdownMenuSeparator />
            <AppDropdownItem onClick={onClose}>
              <X className="size-4" />
              {t("split.close")}
            </AppDropdownItem>
            <AppDropdownItem onClick={onCloseAll}>
              <Square className="size-4" />
              {t("split.closeAll")}
            </AppDropdownItem>
          </>
        ) : null}
      </AppDropdownContent>
    </DropdownMenu>
  );
}
