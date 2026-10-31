import type { DeckCompileWarning, DeckExportFormat } from "@cocurdex/shared";
import { toast } from "sonner";
import { downloadDeck } from "./deck-download";

const MAX_LISTED_WARNINGS = 5;

export async function exportDeckWithFeedback(
  id: string,
  format: DeckExportFormat,
  failureMessage: string,
) {
  try {
    await downloadDeck(id, format);
  } catch (error) {
    toast.error(failureMessage, {
      description: error instanceof Error ? error.message : String(error),
    });
  }
}

export function reportImportWarnings(
  warnings: DeckCompileWarning[],
  title: string,
) {
  if (warnings.length === 0) return;
  toast.warning(title, {
    description: warnings
      .slice(0, MAX_LISTED_WARNINGS)
      .map((warning) => warning.message)
      .join("\n"),
  });
}
