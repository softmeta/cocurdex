import { useTranslation } from "react-i18next";
import { Input, Text } from "@/components/ui";

interface PdfPageJumpInputProps {
  currentPage: number;
  totalPages: number;
  onGoToPage(pageNumber: number): void;
}

function clampPage(value: number, totalPages: number): number {
  return Math.min(totalPages, Math.max(1, value));
}

// Editable page indicator: current page is an input; total is static label.
// The input is uncontrolled and keyed on `currentPage`, so scrolling remounts it
// with the new page while in-progress typing is never clobbered by a scroll update.
export function PdfPageJumpInput({
  currentPage,
  totalPages,
  onGoToPage,
}: PdfPageJumpInputProps) {
  const { t } = useTranslation("editor");
  // Size the editable field to the widest page number the document can show.
  const pageFieldCh = Math.max(String(totalPages).length, 1);

  const commit = (raw: string, input: HTMLInputElement) => {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) {
      const clamped = clampPage(parsed, totalPages);
      input.value = String(clamped);
      onGoToPage(clamped);
    } else {
      // Reject non-numeric input by restoring the current page.
      input.value = String(currentPage);
    }
  };

  const nudge = (delta: number, input: HTMLInputElement) => {
    const base = Number.parseInt(input.value, 10);
    const from = Number.isFinite(base) ? base : currentPage;
    const next = clampPage(from + delta, totalPages);
    input.value = String(next);
    onGoToPage(next);
  };

  return (
    <div className="flex h-7 items-center gap-1">
      <Input
        key={currentPage}
        aria-label={t("pdf.goToPage")}
        defaultValue={currentPage}
        inputMode="numeric"
        onBlur={(event) =>
          commit(event.currentTarget.value, event.currentTarget)
        }
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit(event.currentTarget.value, event.currentTarget);
            event.currentTarget.blur();
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            nudge(1, event.currentTarget);
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            nudge(-1, event.currentTarget);
          }
        }}
        style={{ width: `calc(${pageFieldCh}ch + 0.75rem)` }}
        className="h-7 min-w-0 rounded-control border-border/60 px-1 text-center text-meta tabular-nums shadow-none focus-visible:border-ring/60 focus-visible:ring-2 focus-visible:ring-ring/20 dark:bg-transparent"
      />
      <Text size="meta" tone="muted" className="leading-none tabular-nums">
        / {totalPages}
      </Text>
    </div>
  );
}
