import type { SessionRecord } from "@cocurdex/shared";
import { useSetAtom } from "jotai";
import { Archive, Pencil, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuSeparator,
  ContextMenuTrigger,
  SidebarListRow,
  Spinner,
} from "@/components/ui";
import {
  agentLabels,
  archiveSessionAtom,
  deleteSessionAtom,
  updateSessionTitleAtom,
} from "@/features/sessions";
import { desktopApi, logRendererDiagnostic } from "@/lib";
import { SidebarContextMenuItem } from "./sidebar-context-menu-item";
import { SidebarItemTooltip } from "./sidebar-item-preview";
import { SidebarOverflowTitle } from "./sidebar-overflow-title";
import { SidebarRenameInput } from "./sidebar-rename-input";

interface SessionSidebarItemProps {
  isActive: boolean;
  onSelect(): void;
  session: SessionRecord;
}

export function SessionSidebarItem({
  isActive,
  onSelect,
  session,
}: SessionSidebarItemProps) {
  const { t } = useTranslation("sessions");
  const updateSessionTitle = useSetAtom(updateSessionTitleAtom);
  const archiveSession = useSetAtom(archiveSessionAtom);
  const deleteSession = useSetAtom(deleteSessionAtom);
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(session.title);
  const isRunning = session.status === "running";
  const renameInputRef = useCallback((node: HTMLInputElement | null) => {
    node?.focus();
    node?.select();
  }, []);

  const startRename = () => {
    setDraftTitle(session.title);
    setIsRenaming(true);
  };

  const cancelRename = () => {
    setDraftTitle(session.title);
    setIsRenaming(false);
  };

  const commitRename = () => {
    const title = draftTitle.trim();

    if (!title || title === session.title) {
      cancelRename();
      return;
    }

    const updatedAt = new Date().toISOString();
    updateSessionTitle({
      sessionId: session.id,
      title,
      updatedAt,
    });
    setIsRenaming(false);

    void desktopApi
      .updateSessionTitle({
        sessionId: session.id,
        title,
        updatedAt,
      })
      .catch((error) => {
        logRendererDiagnostic("debug", "[SessionTitle] manual rename failed", {
          sessionId: session.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      });
  };

  const handleArchive = () => {
    const archivedAt = new Date().toISOString();
    archiveSession({ sessionId: session.id, archivedAt });

    void desktopApi
      .archiveSession({ sessionId: session.id, archivedAt })
      .catch((error) => {
        logRendererDiagnostic("debug", "[SessionArchive] archive failed", {
          sessionId: session.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      });
  };

  const handleDelete = () => {
    deleteSession({ sessionId: session.id });

    void desktopApi.deleteSession({ sessionId: session.id }).catch((error) => {
      logRendererDiagnostic("debug", "[SessionDelete] delete failed", {
        sessionId: session.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    });
  };

  if (isRenaming) {
    return (
      <SidebarRenameInput
        aria-label={t("sidebar.renameSession", { title: session.title })}
        onBlur={commitRename}
        onChange={(event) => setDraftTitle(event.target.value)}
        onFocus={(event) => event.target.select()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }

          if (event.key === "Escape") {
            event.preventDefault();
            cancelRename();
          }
        }}
        ref={renameInputRef}
        value={draftTitle}
      />
    );
  }

  return (
    <ContextMenu>
      <SidebarItemTooltip
        agentLabel={agentLabels[session.agentType]}
        timestamp={session.lastMessageAt ?? session.updatedAt}
        title={session.title}
      >
        <ContextMenuTrigger asChild>
          <SidebarListRow
            isActive={isActive}
            // Match workspace name: parent ps-1 + folder icon size-3.5 + gap-1.5.
            className="ps-6"
            onClick={onSelect}
            render={<button type="button" />}
          >
            <SidebarOverflowTitle>{session.title}</SidebarOverflowTitle>
            {isRunning ? (
              <Spinner
                aria-label={t("sidebar.running")}
                className="shrink-0 text-sidebar-thinking-fg"
                size="xs"
              />
            ) : null}
          </SidebarListRow>
        </ContextMenuTrigger>
      </SidebarItemTooltip>
      <ContextMenuContent className="min-w-26">
        <SidebarContextMenuItem icon={Pencil} onClick={startRename}>
          {t("sidebar.rename")}
        </SidebarContextMenuItem>
        <SidebarContextMenuItem icon={Archive} onClick={handleArchive}>
          {t("sidebar.archive")}
        </SidebarContextMenuItem>
        <ContextMenuSeparator />
        <SidebarContextMenuItem
          destructive
          icon={Trash2}
          onClick={handleDelete}
        >
          {t("sidebar.delete")}
        </SidebarContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
