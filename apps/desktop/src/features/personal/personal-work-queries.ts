import { useStore } from "jotai";
import useSWR from "swr";
import { sessionsAtom } from "@/features/sessions";
import { desktopApi, requestDaemon, useMountEffect } from "@/lib";

export function usePersonalWork(personaId: string) {
  const store = useStore();
  const result = useSWR(
    ["personalAgent.work.list", personaId],
    () => requestDaemon("personalAgent.work.list", { personaId }),
    { dedupingInterval: 0 },
  );
  useMountEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void result.mutate();
      }, 250);
    };
    const stopSessions = store.sub(sessionsAtom, refresh);
    const stopData = desktopApi.onDataChanged((event) => {
      if (event.areas.some((area) => area === "personal" || area === "agent"))
        refresh();
    });
    return () => {
      if (timer) clearTimeout(timer);
      stopSessions();
      stopData();
    };
  });
  return result;
}
