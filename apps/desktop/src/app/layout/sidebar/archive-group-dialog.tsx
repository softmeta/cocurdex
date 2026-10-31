import { useAtom, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AppConfirmDialog } from "@/components";
import { archiveSessionAtom, upsertSessionAtom } from "@/features/sessions";
import { desktopApi, logRendererDiagnostic } from "@/lib";
import { archiveGroupRequestAtom, rootSessionIds } from "./archive-group-store";

function useArchiveSessions() {
  const { t } = useTranslation("sessions");
  const removeArchived = useSetAtom(archiveSessionAtom);
  const upsertSession = useSetAtom(upsertSessionAtom);

  const undo = async (sessionIds: string[]) => {
    try {
      const restored = await desktopApi.restoreSessions({ sessionIds });
      for (const session of restored) {
        upsertSession(session);
      }
    } catch (error) {
      toast.error(t("archiveGroup.undoFailed"));
      logRendererDiagnostic("debug", "[SessionArchive] undo failed", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  return async (sessionIds: string[]) => {
    try {
      const { archivedSessionIds, skippedCount } =
        await desktopApi.archiveSessions({ sessionIds });
      for (const sessionId of archivedSessionIds) {
        removeArchived({ sessionId });
      }
      toast.success(
        t("archiveGroup.success", { count: archivedSessionIds.length }),
        {
          description:
            skippedCount > 0
              ? t("archiveGroup.skipped", { count: skippedCount })
              : undefined,
          action:
            archivedSessionIds.length > 0
              ? {
                  label: t("archiveGroup.undo"),
                  onClick: () => void undo(archivedSessionIds),
                }
              : undefined,
        },
      );
    } catch (error) {
      toast.error(t("archiveGroup.failed"));
      logRendererDiagnostic("debug", "[SessionArchive] group archive failed", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };
}

export function ArchiveGroupDialog() {
  const { t } = useTranslation("sessions");
  const [request, setRequest] = useAtom(archiveGroupRequestAtom);
  const archiveSessions = useArchiveSessions();
  const rootIds = request ? rootSessionIds(request.sessions) : [];

  return (
    <AppConfirmDialog
      cancelLabel={t("archiveGroup.cancel")}
      confirmLabel={t("archiveGroup.confirm")}
      description={t("archiveGroup.description", {
        group: request?.label ?? "",
      })}
      onConfirm={() => void archiveSessions(rootIds)}
      onOpenChange={(open) => {
        if (!open) {
          setRequest(null);
        }
      }}
      open={request !== null}
      title={t("archiveGroup.title", { count: rootIds.length })}
    />
  );
}
