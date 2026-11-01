import { createDaemonBlobUrlStore } from "@/lib";

export const useDeckImageUrl = createDaemonBlobUrlStore({
  request: (hash) => ({ kind: "deckAsset", hash }),
  failureDiagnostic: "decks.imageLoadFailed",
});
