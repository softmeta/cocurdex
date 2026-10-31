import { buildDaemonDeckAssetUrl } from "@cocurdex/shared";
import { createDaemonBlobUrlStore } from "@/lib";

export const useDeckImageUrl = createDaemonBlobUrlStore({
  buildUrl: buildDaemonDeckAssetUrl,
  failureDiagnostic: "decks.imageLoadFailed",
});
