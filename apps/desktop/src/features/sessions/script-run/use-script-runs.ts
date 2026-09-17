import type { ScriptRunRecord } from "@cocurdex/shared";
import { useState } from "react";
import { desktopApi, useMountEffect } from "@/lib";

export function useScriptRuns(requesterSessionId: string) {
  const [runs, setRuns] = useState<ScriptRunRecord[]>([]);

  useMountEffect(() => {
    let cancelled = false;
    const load = () =>
      desktopApi.listScriptRuns(requesterSessionId).then((next) => {
        if (!cancelled) setRuns(next);
      });
    void load();
    const unsubscribe = desktopApi.onDataChanged((event) => {
      if (event.areas.includes("agent")) void load();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  });

  return runs;
}
