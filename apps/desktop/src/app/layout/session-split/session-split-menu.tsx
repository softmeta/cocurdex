import {
  Ellipsis,
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
import {
  TITLEBAR_ICON_GLYPH_CLASS,
  TitlebarIconButton,
} from "../titlebar-icon-button";

interface SessionSplitMenuProps {
  canClose: boolean;
  canSplit: boolean;
  onClose(): void;
  onSplitDown(): void;
  onSplitRight(): void;
}

export function SessionSplitMenu({
  canClose,
  canSplit,
  onClose,
  onSplitDown,
  onSplitRight,
}: SessionSplitMenuProps) {
  const { t } = useTranslation("sessions");
  const [open, setOpen] = useState(false);

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
        align="end"
        className={compactDropdownContentClassName}
        side="bottom"
      >
        <AppDropdownItem disabled={!canSplit} onClick={onSplitDown}>
          <SquareSplitHorizontal className="size-4" />
          {t("split.down")}
        </AppDropdownItem>
        <AppDropdownItem disabled={!canSplit} onClick={onSplitRight}>
          <SquareSplitVertical className="size-4" />
          {t("split.right")}
        </AppDropdownItem>
        {canClose ? (
          <>
            <DropdownMenuSeparator />
            <AppDropdownItem onClick={onClose}>
              <X className="size-4" />
              {t("split.close")}
            </AppDropdownItem>
          </>
        ) : null}
      </AppDropdownContent>
    </DropdownMenu>
  );
}
