import { Columns2, FileCode, Rows3, Settings2, WrapText } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TitlebarIconButton } from "@/app/layout/titlebar-icon-button";
import { AppDropdownRadioList } from "@/components";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
      <DropdownMenuTrigger
        render={
          <TitlebarIconButton
            tooltipSide="top"
            active={open}
            aria-expanded={open}
            aria-label={t("git.diffViewSettings")}
          >
            <Settings2 className="size-3.5" />
          </TitlebarIconButton>
        }
      />
      <DropdownMenuContent align="end">
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
