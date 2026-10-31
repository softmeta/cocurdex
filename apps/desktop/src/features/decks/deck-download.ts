import {
  buildDaemonDeckDownloadUrl,
  type DeckExportFormat,
} from "@cocurdex/shared";
import { desktopApi, resolveLocalDaemonConnection } from "@/lib";
import { decksApi } from "./decks-api";

export async function downloadDeck(id: string, format: DeckExportFormat) {
  const [download, connection] = await Promise.all([
    decksApi.createDownload({ id, format }),
    resolveLocalDaemonConnection(),
  ]);
  await desktopApi.downloadUrl(
    buildDaemonDeckDownloadUrl(connection.webSocketUrl, download),
  );
}
