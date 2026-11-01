import type { DeckExportFormat } from "@cocurdex/shared";
import { saveDeckDownload } from "@/lib";
import { decksApi } from "./decks-api";

export async function downloadDeck(id: string, format: DeckExportFormat) {
  await saveDeckDownload(await decksApi.createDownload({ id, format }));
}
