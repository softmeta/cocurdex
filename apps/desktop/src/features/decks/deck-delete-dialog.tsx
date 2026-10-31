import type { DeckSummary } from "@cocurdex/shared";
import { useTranslation } from "react-i18next";
import { AppConfirmDialog } from "@/components";

export function DeckDeleteDialog({
  deck,
  onClose,
  onConfirm,
}: {
  deck: DeckSummary | null;
  onClose: () => void;
  onConfirm: (id: string) => void;
}) {
  const { t } = useTranslation("decks");
  return (
    <AppConfirmDialog
      open={deck !== null}
      variant="destructive"
      title={t("sidebar.deleteConfirm.title", {
        title: deck?.title || t("sidebar.untitled"),
      })}
      description={t("sidebar.deleteConfirm.description")}
      cancelLabel={t("sidebar.deleteConfirm.cancel")}
      confirmLabel={t("sidebar.deleteConfirm.confirm")}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onConfirm={() => {
        if (deck) onConfirm(deck.id);
        onClose();
      }}
    />
  );
}
