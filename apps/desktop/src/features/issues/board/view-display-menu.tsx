import type { ViewGroupBy, ViewLayout } from "@cocurdex/shared";
import { Columns3, LayoutList, Rows3, Settings2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  TITLEBAR_ICON_GLYPH_CLASS,
  TitlebarIconButton,
} from "@/app/layout/titlebar-icon-button";
import { AppDropdownRadioList } from "@/components";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Text,
} from "@/components/ui";

const LAYOUT_OPTIONS: ViewLayout[] = ["list", "board"];
const GROUP_BY_OPTIONS: ViewGroupBy[] = ["status", "priority"];

interface ViewDisplayMenuProps {
  layout: ViewLayout;
  groupBy: ViewGroupBy;
  onLayoutChange: (layout: ViewLayout) => void;
  onGroupByChange: (groupBy: ViewGroupBy) => void;
}

/**
 * View display menu — layout + group-by as official radio groups.
 * Stays open across sections so users can adjust both without reopening.
 */
export function ViewDisplayMenu({
  layout,
  groupBy,
  onLayoutChange,
  onGroupByChange,
}: ViewDisplayMenuProps) {
  const { t } = useTranslation("issues");
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <TitlebarIconButton
          active={open}
          aria-expanded={open}
          aria-label={t("board.displayOptions")}
        >
          <Settings2 className={TITLEBAR_ICON_GLYPH_CLASS} />
        </TitlebarIconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-1.5 px-2 py-1.5">
            <Settings2 className="size-3.5 text-editor-fg-subtle" />
            <Text size="meta" weight="medium" className="text-editor-fg-subtle">
              {t("board.layout")}
            </Text>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <AppDropdownRadioList
          closeOnClick={false}
          value={layout}
          onValueChange={(value) => onLayoutChange(value as ViewLayout)}
          options={LAYOUT_OPTIONS.map((option) => ({
            value: option,
            label:
              option === "list"
                ? t("board.layoutList")
                : t("board.layoutBoard"),
            icon:
              option === "list" ? (
                <LayoutList className="size-3.5 text-editor-fg-subtle" />
              ) : (
                <Columns3 className="size-3.5 text-editor-fg-subtle" />
              ),
          }))}
        />

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-1.5 px-2 py-1.5">
            <Rows3 className="size-3.5 text-editor-fg-subtle" />
            <Text size="meta" weight="medium" className="text-editor-fg-subtle">
              {layout === "list" ? t("board.groupBy") : t("board.columnsField")}
            </Text>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <AppDropdownRadioList
          closeOnClick={false}
          value={groupBy}
          onValueChange={(value) => onGroupByChange(value as ViewGroupBy)}
          options={GROUP_BY_OPTIONS.map((option) => ({
            value: option,
            label:
              option === "priority"
                ? t("board.groupByPriority")
                : t("board.groupByStatus"),
          }))}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
