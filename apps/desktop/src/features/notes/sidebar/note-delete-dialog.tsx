import type { NoteSummary } from "@cocurdex/shared";
import { useTranslation } from "react-i18next";
import { AppConfirmDialog } from "@/components";

export function NoteDeleteDialog({
  note,
  hasChildren,
  onClose,
  onConfirm,
}: {
  note: NoteSummary | null;
  hasChildren: boolean;
  onClose: () => void;
  onConfirm: (id: string) => void;
}) {
  const { t } = useTranslation("notes");
  return (
    <AppConfirmDialog
      open={note !== null}
      variant="destructive"
      title={t("sidebar.deleteConfirm.title", {
        title: note?.title || t("sidebar.untitled"),
      })}
      description={
        hasChildren
          ? t("sidebar.deleteConfirm.descriptionTree")
          : t("sidebar.deleteConfirm.descriptionNote")
      }
      cancelLabel={t("sidebar.deleteConfirm.cancel")}
      confirmLabel={t("sidebar.deleteConfirm.confirm")}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onConfirm={() => {
        if (note) onConfirm(note.id);
        onClose();
      }}
    />
  );
}
