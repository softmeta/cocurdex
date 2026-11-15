import useSWR from "swr";
import { desktopApi, requestDaemon, useMountEffect } from "@/lib";

export function usePendingFollowUps(personaId: string) {
  const result = useSWR(
    ["followUp.list", personaId, "pending"],
    () =>
      requestDaemon("followUp.list", { agentId: personaId, status: "pending" }),
    { dedupingInterval: 0 },
  );
  useMountEffect(() =>
    desktopApi.onDataChanged((event) => {
      if (event.areas.includes("personal")) void result.mutate();
    }),
  );
  return result;
}
