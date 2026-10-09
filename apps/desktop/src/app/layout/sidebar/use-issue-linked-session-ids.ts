import { useEffect, useState } from "react";
import { desktopApi, logRendererDiagnostic } from "@/lib";

const EMPTY_IDS: ReadonlySet<string> = new Set();

export function useIssueLinkedSessionIds(enabled: boolean) {
  const [ids, setIds] = useState<ReadonlySet<string>>(EMPTY_IDS);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    const load = () =>
      desktopApi
        .issueListLinkedSessionIds()
        .then((next) => {
          if (!cancelled) setIds(new Set(next));
        })
        .catch((error: unknown) => {
          logRendererDiagnostic("debug", "[Sidebar] issue links failed", {
            error: error instanceof Error ? error.message : String(error),
          });
        });
    void load();
    const unsubscribe = desktopApi.onDataChanged((event) => {
      if (event.areas.includes("issues")) void load();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [enabled]);

  return enabled ? ids : EMPTY_IDS;
}
