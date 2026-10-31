import type { ViewSummary } from "@cocurdex/shared";
import { useTranslation } from "react-i18next";
import { AppConfirmDialog } from "@/components";

export function DeleteViewDialog({
  view,
  onClose,
  onConfirm,
}: {
  view: ViewSummary | null;
  onClose: () => void;
  onConfirm: (viewId: string) => void;
}) {
  const { t } = useTranslation("issues");
  return (
    <AppConfirmDialog
      open={view !== null}
      variant="destructive"
      title={t("sidebar.deleteViewConfirm.title")}
      description={t("sidebar.deleteViewConfirm.description", {
        title: view?.title || t("sidebar.untitledBoard"),
      })}
      cancelLabel={t("sidebar.deleteViewConfirm.cancel")}
      confirmLabel={t("sidebar.deleteViewConfirm.confirm")}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onConfirm={() => {
        if (view) onConfirm(view.id);
        onClose();
      }}
    />
  );
}
