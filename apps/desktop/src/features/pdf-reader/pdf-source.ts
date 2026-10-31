import { buildDaemonPdfUrl } from "@cocurdex/shared";
import { resolveLocalDaemonConnection } from "@/lib";

export interface PdfSource {
  url: string;
  httpHeaders: Record<string, string>;
}

export async function resolvePdfSource(filePath: string): Promise<PdfSource> {
  const connection = await resolveLocalDaemonConnection();
  return {
    url: buildDaemonPdfUrl(connection.webSocketUrl, filePath),
    httpHeaders: { Authorization: `Bearer ${connection.token}` },
  };
}
