import {
  DEFAULT_VIEW_DISPLAY,
  ISSUE_DISPLAY_PROPERTIES,
  type IssueDisplayProperty,
  VIEW_GROUP_BY_FIELDS,
  type ViewDisplay,
  type ViewGroupBy,
  type ViewLayout,
} from "@cocurdex/shared";
import { useSetAtom } from "jotai";
import {
  CircleDashed,
  Columns3,
  LayoutList,
  ListChecks,
  Rows3,
  Settings2,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TitlebarIconButton } from "@/app/layout/titlebar-icon-button";
import { AppDropdownRadioList } from "@/components";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Text,
} from "@/components/ui";
import { issueStatusesDialogOpenAtom } from "../statuses/issue-statuses-dialog-store";

const LAYOUT_OPTIONS: ViewLayout[] = ["list", "board"];

function toggleProperty(
  display: ViewDisplay,
  property: IssueDisplayProperty,
  checked: boolean,
): ViewDisplay {
  const next = new Set(display.properties);
  if (checked) next.add(property);
  else next.delete(property);
  return {
    ...display,
    properties: ISSUE_DISPLAY_PROPERTIES.filter((item) => next.has(item)),
  };
}

interface ViewDisplayMenuProps {
  layout: ViewLayout;
  groupBy: ViewGroupBy;
  onLayoutChange: (layout: ViewLayout) => void;
  onGroupByChange: (groupBy: ViewGroupBy) => void;
  display: ViewDisplay | undefined;
  onDisplayChange: (display: ViewDisplay) => void;
}

export function ViewDisplayMenu({
  layout,
  groupBy,
  onLayoutChange,
  onGroupByChange,
  display = DEFAULT_VIEW_DISPLAY,
  onDisplayChange,
}: ViewDisplayMenuProps) {
  const { t } = useTranslation("issues");
  const groupByLabels: Record<ViewGroupBy, string> = {
    status: t("board.groupByStatus"),
    priority: t("board.groupByPriority"),
    label: t("board.groupByLabel"),
    workspace: t("board.groupByWorkspace"),
    parent: t("board.groupByParent"),
  };
  const propertyLabels: Record<IssueDisplayProperty, string> = {
    identifier: t("display.identifier"),
    status: t("display.status"),
    priority: t("display.priority"),
    labels: t("display.labels"),
    workspace: t("display.workspace"),
    parent: t("display.parent"),
    description: t("display.description"),
    created: t("display.created"),
    updated: t("display.updated"),
  };
  const [open, setOpen] = useState(false);
  const openStatuses = useSetAtom(issueStatusesDialogOpenAtom);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <TitlebarIconButton
          active={open}
          aria-expanded={open}
          aria-label={t("board.displayOptions")}
        >
          <Settings2 className="size-3.5" />
        </TitlebarIconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-1.5">
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
          <DropdownMenuLabel className="flex items-center gap-1.5">
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
          options={VIEW_GROUP_BY_FIELDS.map((option) => ({
            value: option,
            label: groupByLabels[option],
          }))}
        />

        <DropdownMenuSeparator />

        <DropdownMenuCheckboxItem
          closeOnClick={false}
          checked={display.showEmptyGroups}
          onCheckedChange={(checked) =>
            onDisplayChange({ ...display, showEmptyGroups: checked })
          }
        >
          {layout === "list"
            ? t("display.showEmptyGroups")
            : t("display.showEmptyColumns")}
        </DropdownMenuCheckboxItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ListChecks className="size-3.5" />
            {t("display.properties")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-44">
            {ISSUE_DISPLAY_PROPERTIES.map((property) => (
              <DropdownMenuCheckboxItem
                key={property}
                closeOnClick={false}
                checked={display.properties.includes(property)}
                onCheckedChange={(checked) =>
                  onDisplayChange(toggleProperty(display, property, checked))
                }
              >
                {propertyLabels[property]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => openStatuses(true)}>
          <CircleDashed className="size-3.5" />
          {t("board.manageStatuses")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
