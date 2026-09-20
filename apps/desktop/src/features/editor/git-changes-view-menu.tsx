import { Columns2, FileCode, Rows3, Settings2, WrapText } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  TITLEBAR_ICON_GLYPH_CLASS,
  TitlebarIconButton,
} from "@/app/layout/titlebar-icon-button";
import {
  AppDropdownRadioList,
  appPopupContentWidthClassName,
} from "@/components";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { GitDiffStyle } from "./git-changes-model";

interface GitChangesViewMenuProps {
  diffStyle: GitDiffStyle;
  expandUnchanged: boolean;
  wrap: boolean;
  onDiffStyleChange: (style: GitDiffStyle) => void;
  onExpandUnchangedChange: (expandUnchanged: boolean) => void;
  onWrapChange: (wrap: boolean) => void;
}

export function GitChangesViewMenu({
  diffStyle,
  expandUnchanged,
  wrap,
  onDiffStyleChange,
  onExpandUnchangedChange,
  onWrapChange,
}: GitChangesViewMenuProps) {
  const { t } = useTranslation("editor");
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <TitlebarIconButton
                  active={open}
                  aria-expanded={open}
                  aria-label={t("git.diffViewSettings")}
                >
                  <Settings2 className={TITLEBAR_ICON_GLYPH_CLASS} />
                </TitlebarIconButton>
              }
            />
          }
        />
        <TooltipContent side="top" sideOffset={6}>
          {t("git.diffViewSettings")}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        className={appPopupContentWidthClassName}
      >
        <AppDropdownRadioList
          closeOnClick={false}
          value={diffStyle}
          onValueChange={(value) => onDiffStyleChange(value as GitDiffStyle)}
          options={[
            {
              value: "unified",
              label: t("git.unifiedView"),
              icon: <Rows3 className="size-3.5 text-editor-fg-subtle" />,
            },
            {
              value: "split",
              label: t("git.splitView"),
              icon: <Columns2 className="size-3.5 text-editor-fg-subtle" />,
            },
          ]}
        />
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={expandUnchanged}
          onCheckedChange={onExpandUnchangedChange}
        >
          <FileCode className="size-3.5 text-editor-fg-subtle" />
          {t("git.toggleFullFile")}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={wrap} onCheckedChange={onWrapChange}>
          <WrapText className="size-3.5 text-editor-fg-subtle" />
          {t("git.toggleWrap")}
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
