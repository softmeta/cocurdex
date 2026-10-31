import type { Editor } from "@tiptap/core";
import type { Command, EditorState } from "@tiptap/pm/state";
import {
  ArrowDownAZ,
  ArrowDownZA,
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  BetweenVerticalEnd,
  BetweenVerticalStart,
  Copy,
  Eraser,
  Grid2x2X,
  type LucideIcon,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignStart,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppDropdownRadioList } from "@/components/app";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui";
import {
  type ColumnAlign,
  clearTableSlice,
  deleteTableSlice,
  duplicateTableSlice,
  insertTableSlice,
  setTableColumnAlign,
  sortTableByColumn,
  type TableTarget,
} from "./table-commands";

interface TableSliceMenuItemsProps {
  editor: Editor;
  state: EditorState;
  target: TableTarget;
  rtl: boolean;
}

function MenuAction({
  editor,
  state,
  command,
  icon: Icon,
  label,
  destructive = false,
}: {
  editor: Editor;
  state: EditorState;
  command: Command;
  icon: LucideIcon;
  label: string;
  destructive?: boolean;
}) {
  return (
    <DropdownMenuItem
      variant={destructive ? "destructive" : "default"}
      disabled={!command(state)}
      onClick={() => {
        command(editor.state, editor.view.dispatch);
      }}
    >
      <Icon className="size-3.5" />
      {label}
    </DropdownMenuItem>
  );
}

function columnAlignOf(state: EditorState, target: TableTarget): ColumnAlign {
  const table = state.doc.nodeAt(target.tablePos);
  const align = table?.firstChild?.maybeChild(target.range.from)?.attrs.align;
  return align === "center" || align === "right" ? align : "left";
}

function ColumnAlignSubmenu({
  editor,
  state,
  target,
}: Omit<TableSliceMenuItemsProps, "rtl">) {
  const { t } = useTranslation("notes");
  const options = [
    { value: "left", label: t("table.align.left"), icon: <TextAlignStart /> },
    {
      value: "center",
      label: t("table.align.center"),
      icon: <TextAlignCenter />,
    },
    { value: "right", label: t("table.align.right"), icon: <TextAlignEnd /> },
  ];
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <TextAlignStart className="size-3.5" />
        {t("table.align.label")}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <AppDropdownRadioList
          value={columnAlignOf(state, target)}
          options={options}
          onValueChange={(value) => {
            const align = value === "left" ? null : (value as ColumnAlign);
            setTableColumnAlign(target, align)(
              editor.state,
              editor.view.dispatch,
            );
          }}
        />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

export function TableSliceMenuItems({
  editor,
  state,
  target,
  rtl,
}: TableSliceMenuItemsProps) {
  const { t } = useTranslation("notes");
  const { tablePos, axis, range } = target;
  const count = range.to - range.from + 1;
  const isRow = axis === "row";
  const leadingIndex = rtl ? range.to + 1 : range.from;
  const trailingIndex = rtl ? range.from : range.to + 1;
  const deleteTable: Command = (state, dispatch) => {
    const table = state.doc.nodeAt(tablePos);
    if (!table) return false;
    dispatch?.(state.tr.delete(tablePos, tablePos + table.nodeSize));
    return true;
  };

  return (
    <>
      {isRow ? (
        <>
          <MenuAction
            editor={editor}
            state={state}
            command={insertTableSlice(tablePos, "row", range.from)}
            icon={BetweenHorizontalStart}
            label={t("table.insertAbove")}
          />
          <MenuAction
            editor={editor}
            state={state}
            command={insertTableSlice(tablePos, "row", range.to + 1)}
            icon={BetweenHorizontalEnd}
            label={t("table.insertBelow")}
          />
        </>
      ) : (
        <>
          <MenuAction
            editor={editor}
            state={state}
            command={insertTableSlice(tablePos, "column", leadingIndex)}
            icon={BetweenVerticalStart}
            label={t("table.insertLeft")}
          />
          <MenuAction
            editor={editor}
            state={state}
            command={insertTableSlice(tablePos, "column", trailingIndex)}
            icon={BetweenVerticalEnd}
            label={t("table.insertRight")}
          />
        </>
      )}
      <DropdownMenuSeparator />
      {isRow ? null : (
        <>
          <ColumnAlignSubmenu editor={editor} state={state} target={target} />
          <MenuAction
            editor={editor}
            state={state}
            command={sortTableByColumn(tablePos, range.from, "asc")}
            icon={ArrowDownAZ}
            label={t("table.sortAscending")}
          />
          <MenuAction
            editor={editor}
            state={state}
            command={sortTableByColumn(tablePos, range.from, "desc")}
            icon={ArrowDownZA}
            label={t("table.sortDescending")}
          />
          <DropdownMenuSeparator />
        </>
      )}
      <MenuAction
        editor={editor}
        state={state}
        command={duplicateTableSlice(target)}
        icon={Copy}
        label={t("table.duplicate")}
      />
      <MenuAction
        editor={editor}
        state={state}
        command={clearTableSlice(target)}
        icon={Eraser}
        label={t("table.clear")}
      />
      <DropdownMenuSeparator />
      <MenuAction
        editor={editor}
        state={state}
        command={deleteTableSlice(target)}
        icon={Trash2}
        label={
          isRow
            ? t("table.deleteRows", { count })
            : t("table.deleteColumns", { count })
        }
        destructive
      />
      <MenuAction
        editor={editor}
        state={state}
        command={deleteTable}
        icon={Grid2x2X}
        label={t("table.deleteTable")}
        destructive
      />
    </>
  );
}
