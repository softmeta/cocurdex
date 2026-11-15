import useSWR from "swr";
import { desktopApi, requestDaemon, useMountEffect } from "@/lib";

export function useToldItems(personaId: string) {
  const result = useSWR(
    ["personalAgent.told.list", personaId],
    () => requestDaemon("personalAgent.told.list", { id: personaId }),
    { dedupingInterval: 0 },
  );
  useMountEffect(() =>
    desktopApi.onDataChanged((event) => {
      if (event.areas.includes("personal") || event.areas.includes("memory")) {
        void result.mutate();
      }
    }),
  );
  return result;
}
