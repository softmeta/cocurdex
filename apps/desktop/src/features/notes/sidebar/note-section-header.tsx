import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  TITLEBAR_ICON_GLYPH_CLASS,
  TitlebarIconButton,
} from "@/app/layout/titlebar-icon-button";
import { SidebarSectionHeader } from "@/components";
import { cn } from "@/lib";
import { sectionDropId } from "./note-moves";

export function NoteSectionHeader({
  workspaceId,
  title,
  collapsed,
  isDropTarget,
  onToggle,
  onCreate,
}: {
  workspaceId: string | null;
  title: string;
  collapsed: boolean;
  isDropTarget: boolean;
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
        collapsed={collapsed}
        onToggle={onToggle}
        action={
          <TitlebarIconButton
            aria-label={t("sidebar.newPageInSection", { section: title })}
            onClick={onCreate}
          >
            <Plus className={TITLEBAR_ICON_GLYPH_CLASS} />
          </TitlebarIconButton>
        }
      />
    </div>
  );
}
