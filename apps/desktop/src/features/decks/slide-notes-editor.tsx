import type { Slide } from "@cocurdex/shared";
import { useTranslation } from "react-i18next";
import { Textarea } from "@/components/ui/textarea";

export function SlideNotesEditor({
  slide,
  onCommit,
}: {
  slide: Slide;
  onCommit: (notes: string) => void;
}) {
  const { t } = useTranslation("decks");
  return (
    <div className="shrink-0 border-t border-border px-3 py-2">
      <Textarea
        key={`${slide.id}:${slide.notes}`}
        aria-label={t("viewer.notes")}
        placeholder={t("editor.notesPlaceholder")}
        defaultValue={slide.notes}
        className="max-h-24 min-h-0 resize-none border-0 bg-transparent p-0 text-muted-foreground shadow-none focus-visible:ring-0 md:text-sm dark:bg-transparent"
        rows={1}
        onBlur={(event) => {
          if (event.currentTarget.value !== slide.notes) {
            onCommit(event.currentTarget.value);
          }
        }}
      />
    </div>
  );
}
