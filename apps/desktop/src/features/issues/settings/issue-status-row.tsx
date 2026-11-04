import {
  ISSUE_STATUS_CATEGORIES,
  type IssueStatusCategory,
  type ViewColumnRecord,
} from "@cocurdex/shared";
import {
  ArrowDown,
  ArrowUp,
  Circle,
  Ellipsis,
  Pencil,
  Shapes,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppDropdownRadioList } from "@/components";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  IconButton,
  Text,
} from "@/components/ui";
import { cn } from "@/lib";
import { groupFieldColor } from "../group-field-color";
import { InlineEdit } from "../inline-edit";

export interface IssueStatusRowProps {
  status: ViewColumnRecord;
  categoryLabels: Record<IssueStatusCategory, string>;
  editing: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canDelete: boolean;
  onEditingChange: (editing: boolean) => void;
  onRename: (title: string) => void;
  onCategoryChange: (category: IssueStatusCategory) => void;
  onMove: (offset: -1 | 1) => void;
  onDelete: () => void;
}

export function IssueStatusRow({
  status,
  categoryLabels,
  editing,
  canMoveUp,
  canMoveDown,
  canDelete,
  onEditingChange,
  onRename,
  onCategoryChange,
  onMove,
  onDelete,
}: IssueStatusRowProps) {
  const { t } = useTranslation("issues");
  const color = groupFieldColor(status);
  return (
    <li className="flex h-11 items-center gap-2.5" data-status-id={status.id}>
      <Circle
        aria-hidden
        className={cn("size-3.5 shrink-0", !color && "text-muted-foreground")}
        strokeWidth={2.25}
        style={color ? { color } : undefined}
      />
      <div className="min-w-0 flex-1">
        <InlineEdit
          value={status.title}
          editing={editing}
          placeholder={t("statuses.newTitle")}
          onSubmit={(title) => {
            onEditingChange(false);
            if (title && title !== status.title) onRename(title);
          }}
          onCancel={() => onEditingChange(false)}
          className="w-full bg-transparent text-body text-foreground outline-none"
        >
          <button
            type="button"
            className="block max-w-full cursor-text truncate text-start"
            onClick={() => onEditingChange(true)}
          >
            <Text size="body">{status.title}</Text>
          </button>
        </InlineEdit>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton
            aria-label={t("statuses.actions", { status: status.title })}
            size="sm"
          >
            <Ellipsis className="size-3.5" />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuItem onClick={() => onEditingChange(true)}>
            <Pencil className="size-3.5" />
            {t("statuses.rename")}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Shapes className="size-3.5" />
              {t("category.title")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <AppDropdownRadioList
                value={status.category ?? "unstarted"}
                onValueChange={(next) => {
                  const category = ISSUE_STATUS_CATEGORIES.find(
                    (candidate) => candidate === next,
                  );
                  if (category && category !== status.category) {
                    onCategoryChange(category);
                  }
                }}
                options={ISSUE_STATUS_CATEGORIES.map((value) => ({
                  value,
                  label: categoryLabels[value],
                }))}
              />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem disabled={!canMoveUp} onClick={() => onMove(-1)}>
            <ArrowUp className="size-3.5" />
            {t("statuses.moveUp")}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canMoveDown} onClick={() => onMove(1)}>
            <ArrowDown className="size-3.5" />
            {t("statuses.moveDown")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!canDelete}
            onClick={onDelete}
            variant="destructive"
          >
            <Trash2 className="size-3.5" />
            {t("statuses.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
