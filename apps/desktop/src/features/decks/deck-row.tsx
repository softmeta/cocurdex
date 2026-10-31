import type { DeckExportFormat, DeckSummary } from "@cocurdex/shared";
import { FileText, Pencil, Presentation, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppInlineRenameInput, AppSidebarRowTitle } from "@/components/app";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  IconButton,
  SidebarListRow,
  SidebarListRowActions,
} from "@/components/ui";
import { useScrollIntoViewWhenActive } from "@/lib/react-hooks";

export function DeckRow({
  deck,
  isActive,
  isRenaming,
  onOpen,
  onStartRename,
  onCancelRename,
  onCommitRename,
  onExport,
  onDelete,
}: {
  deck: DeckSummary;
  isActive: boolean;
  isRenaming: boolean;
  onOpen: () => void;
  onStartRename: () => void;
  onCancelRename: () => void;
  onCommitRename: (title: string) => Promise<void>;
  onExport: (format: DeckExportFormat) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation("decks");
  const scrollRef = useScrollIntoViewWhenActive<HTMLDivElement>(isActive);
  const title = deck.title || t("sidebar.untitled");
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <SidebarListRow
          ref={scrollRef}
          isActive={isActive}
          className="group/deck pe-0.5"
          data-deck-id={deck.id}
        >
          <Presentation
            className="size-3.5 shrink-0 text-sidebar-fg-muted"
            aria-hidden
          />
          {isRenaming ? (
            <AppInlineRenameInput
              initialTitle={deck.title}
              untitledLabel={t("sidebar.untitled")}
              ariaLabel={t("sidebar.rename")}
              onCancel={onCancelRename}
              onCommit={onCommitRename}
            />
          ) : (
            <AppSidebarRowTitle
              title={title}
              timestamp={deck.updatedAt}
              onOpen={onOpen}
              onStartRename={onStartRename}
            />
          )}
          {isRenaming ? null : (
            <SidebarListRowActions visibility="hover-reveal">
              <IconButton
                size="xs"
                variant="ghost"
                className="text-sidebar-fg-muted hover:bg-transparent hover:text-sidebar-fg"
                aria-label={t("sidebar.delete")}
                onClick={onDelete}
              >
                <Trash2 className="size-3.5" />
              </IconButton>
            </SidebarListRowActions>
          )}
        </SidebarListRow>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-44">
        <ContextMenuItem onClick={onStartRename}>
          <Pencil className="size-3.5" />
          {t("sidebar.rename")}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onExport("pptx")}>
          <Presentation className="size-3.5" />
          {t("actions.exportPptx")}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onExport("pdf")}>
          <FileText className="size-3.5" />
          {t("actions.exportPdf")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 className="size-3.5" />
          {t("sidebar.delete")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
