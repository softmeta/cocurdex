import {
  ISSUE_STATUS_CATEGORIES,
  type IssueStatusCategory,
} from "@cocurdex/shared";
import { Ellipsis } from "lucide-react";
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
  DropdownMenuTrigger,
} from "@/components/ui";

function useCategoryLabels(): Record<IssueStatusCategory, string> {
  const { t } = useTranslation("issues");
  return {
    backlog: t("category.backlog"),
    unstarted: t("category.unstarted"),
    started: t("category.started"),
    completed: t("category.completed"),
    canceled: t("category.canceled"),
  };
}

export function ColumnCategoryMenu({
  category,
  onCategoryChange,
}: {
  category: IssueStatusCategory;
  onCategoryChange: (category: IssueStatusCategory) => void;
}) {
  const { t } = useTranslation("issues");
  const labels = useCategoryLabels();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <TitlebarIconButton
          aria-label={t("board.columnMenu")}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <Ellipsis className={TITLEBAR_ICON_GLYPH_CLASS} />
        </TitlebarIconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("category.title")}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <AppDropdownRadioList
          value={category}
          onValueChange={(next) => {
            const match = ISSUE_STATUS_CATEGORIES.find(
              (candidate) => candidate === next,
            );
            if (match && match !== category) {
              onCategoryChange(match);
            }
          }}
          options={ISSUE_STATUS_CATEGORIES.map((value) => ({
            value,
            label: labels[value],
          }))}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
