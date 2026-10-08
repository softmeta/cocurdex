import type { ViewSummary } from "@cocurdex/shared";
import { Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  TITLEBAR_ICON_GLYPH_CLASS,
  TitlebarIconButton,
} from "@/app/layout/titlebar-icon-button";
import { SidebarSectionHeader } from "@/components";
import {
  IconButton,
  SidebarListRow,
  SidebarListRowActions,
  SidebarListRowLabel,
} from "@/components/ui";
import { InlineEdit } from "../inline-edit";

export function IssueViewsSection({
  views,
  activeViewId,
  onSelectView,
  onCreateView,
  onDeleteView,
  onRenameView,
}: {
  views: ViewSummary[];
  activeViewId: string | null;
  onSelectView: (viewId: string) => void;
  onCreateView: () => void;
  onDeleteView: (viewId: string) => void;
  onRenameView: (title: string) => void;
}) {
  const { t } = useTranslation("issues");
  const [collapsed, setCollapsed] = useState(false);
  const [editingViewId, setEditingViewId] = useState<string | null>(null);

  return (
    <>
      <SidebarSectionHeader
        title={t("sidebar.views")}
        collapsed={collapsed}
        onToggle={() => setCollapsed((prev) => !prev)}
        action={
          <TitlebarIconButton
            aria-label={t("sidebar.addBoard")}
            onClick={onCreateView}
          >
            <Plus className={TITLEBAR_ICON_GLYPH_CLASS} />
          </TitlebarIconButton>
        }
      />
      {collapsed
        ? null
        : views.map((view) => {
            const active = view.id === activeViewId;
            const title = view.title || t("sidebar.untitledBoard");
            return (
              <SidebarListRow key={view.id} isActive={active}>
                <Layers className="size-3.5 shrink-0 text-sidebar-fg-muted" />
                <div className="min-w-0 flex-1">
                  <InlineEdit
                    value={view.title}
                    editing={editingViewId === view.id}
                    placeholder={t("sidebar.untitledBoard")}
                    onSubmit={(next) => {
                      setEditingViewId(null);
                      const trimmed = next.trim();
                      if (trimmed.length > 0 && trimmed !== view.title.trim()) {
                        onRenameView(trimmed);
                      }
                    }}
                    onCancel={() => setEditingViewId(null)}
                    className="h-6 w-full border-0 bg-transparent p-0 text-body leading-6 text-sidebar-fg outline-none"
                  >
                    <button
                      type="button"
                      className="flex h-6 w-full items-center truncate text-start"
                      onClick={() => {
                        setEditingViewId(null);
                        onSelectView(view.id);
                      }}
                    >
                      <SidebarListRowLabel>{title}</SidebarListRowLabel>
                    </button>
                  </InlineEdit>
                </div>
                <SidebarListRowActions
                  visibility="active-hover"
                  className="h-6 w-12 justify-end"
                >
                  <IconButton
                    size="xs"
                    variant="ghost"
                    tabIndex={active ? 0 : -1}
                    onClick={() => {
                      if (active) setEditingViewId(view.id);
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
                      if (active) onDeleteView(view.id);
                    }}
                    aria-label={t("sidebar.deleteView")}
                  >
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </SidebarListRowActions>
              </SidebarListRow>
            );
          })}
    </>
  );
}
