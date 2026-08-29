import type { ViewSummary } from "@cocurdex/shared";
import { ListTodo, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  TITLEBAR_ICON_GLYPH_CLASS,
  TitlebarIconButton,
} from "@/app/layout/titlebar-icon-button";
import { SidebarPanelToggle } from "@/components";
import {
  IconButton,
  SidebarListRow,
  SidebarListRowActions,
  SidebarListRowLabel,
  Text,
} from "@/components/ui";
import { InlineEdit } from "../inline-edit";

interface IssuesSidebarProps {
  boards: ViewSummary[];
  activeBoardId: string;
  onSelectBoard: (viewId: string) => void;
  onCreateBoard: () => void;
  onDeleteBoard: (viewId: string) => void;
  onRename: (title: string) => void;
  onCollapse: () => void;
}

export function IssuesSidebar({
  boards,
  activeBoardId,
  onSelectBoard,
  onCreateBoard,
  onDeleteBoard,
  onRename,
  onCollapse,
}: IssuesSidebarProps) {
  const { t } = useTranslation("issues");
  // Track which board is being renamed (not a boolean) so switching boards
  // drops the editor without nesting an <input> inside a <button>.
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
      {/* px-2 matches view rows so the toggle lines up with ListTodo icons. */}
      <div className="flex h-6 items-center justify-between px-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <SidebarPanelToggle
            onClick={onCollapse}
            aria-label={t("sidebar.collapse")}
          />
          <Text
            size="meta"
            weight="medium"
            className="leading-none text-editor-fg-subtle"
          >
            {t("sidebar.views")}
          </Text>
        </div>
        <TitlebarIconButton
          aria-label={t("sidebar.addBoard")}
          onClick={onCreateBoard}
        >
          <Plus className={TITLEBAR_ICON_GLYPH_CLASS} />
        </TitlebarIconButton>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {boards.map((board) => {
          const active = board.id === activeBoardId;
          const editing = editingBoardId === board.id;
          // Always use the list title. activeBoard lags during selectBoard load,
          // so feeding its title here made the newly selected row flash the
          // previous board's name.
          const displayTitle = board.title;

          return (
            <SidebarListRow key={board.id} isActive={active}>
              <ListTodo className="size-3.5 shrink-0 text-sidebar-fg-muted" />
              <div className="min-w-0 flex-1">
                <InlineEdit
                  value={displayTitle}
                  editing={editing}
                  placeholder={t("sidebar.untitledBoard")}
                  onSubmit={(title) => {
                    setEditingBoardId(null);
                    const previous = displayTitle.trim();
                    const next = title.trim();
                    if (next.length > 0 && next !== previous) {
                      onRename(next);
                    }
                  }}
                  onCancel={() => setEditingBoardId(null)}
                  className="h-6 w-full border-0 bg-transparent p-0 text-body leading-6 text-sidebar-fg outline-none"
                >
                  <button
                    type="button"
                    className="flex h-6 w-full items-center truncate text-start"
                    onClick={() => {
                      setEditingBoardId(null);
                      onSelectBoard(board.id);
                    }}
                  >
                    <SidebarListRowLabel>
                      {displayTitle || t("sidebar.untitledBoard")}
                    </SidebarListRowLabel>
                  </button>
                </InlineEdit>
              </div>
              {/* Reserve action width so active/inactive rows share height. */}
              <SidebarListRowActions
                visibility="active-hover"
                className="h-6 w-12 justify-end"
              >
                <IconButton
                  size="xs"
                  variant="ghost"
                  tabIndex={active ? 0 : -1}
                  onClick={() => {
                    if (!active) return;
                    setEditingBoardId(board.id);
                  }}
                  aria-label={t("sidebar.renameBoard")}
                >
                  <Pencil className="size-3.5" />
                </IconButton>
                <IconButton
                  size="xs"
                  variant="ghost"
                  tabIndex={active ? 0 : -1}
                  onClick={() => {
                    if (!active) return;
                    onDeleteBoard(board.id);
                  }}
                  aria-label={t("sidebar.deleteView")}
                >
                  <Trash2 className="size-3.5" />
                </IconButton>
              </SidebarListRowActions>
            </SidebarListRow>
          );
        })}
      </div>
    </div>
  );
}
