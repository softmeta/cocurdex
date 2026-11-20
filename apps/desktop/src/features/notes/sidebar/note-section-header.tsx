import { useDroppable } from "@dnd-kit/core";
import { ChevronsDownUp, ChevronsUpDown, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TitlebarIconButton } from "@/app/layout/titlebar-icon-button";
import { SidebarSectionHeader } from "@/components";
import { cn } from "@/lib";
import { sectionDropId } from "./note-moves";

export function NoteSectionHeader({
  workspaceId,
  title,
  collapsed,
  first,
  isDropTarget,
  pages,
  onToggle,
  onCreate,
}: {
  workspaceId: string | null;
  title: string;
  collapsed: boolean;
  first: boolean;
  isDropTarget: boolean;
  pages: { allCollapsed: boolean; onToggle: () => void } | null;
  onToggle: () => void;
  onCreate: () => void;
}) {
  const { t } = useTranslation("notes");
  const { setNodeRef } = useDroppable({ id: sectionDropId(workspaceId) });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-control",
        isDropTarget && "bg-accent/40 ring-1 ring-ring ring-inset",
      )}
    >
      <SidebarSectionHeader
        title={title}
        inset="toggle"
        flush={first}
        collapsed={collapsed}
        onToggle={onToggle}
        action={
          <>
            {pages ? (
              <TitlebarIconButton
                aria-label={
                  pages.allCollapsed
                    ? t("sidebar.expandAllPages")
                    : t("sidebar.collapseAllPages")
                }
                onClick={pages.onToggle}
              >
                {pages.allCollapsed ? (
                  <ChevronsUpDown className="size-3.5" />
                ) : (
                  <ChevronsDownUp className="size-3.5" />
                )}
              </TitlebarIconButton>
            ) : null}
            <TitlebarIconButton
              aria-label={t("sidebar.newPageInSection", { section: title })}
              onClick={onCreate}
            >
              <Plus className="size-3.5" />
            </TitlebarIconButton>
          </>
        }
      />
    </div>
  );
}
