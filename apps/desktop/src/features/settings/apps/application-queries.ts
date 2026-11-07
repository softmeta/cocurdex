import useSWR from "swr";
import { desktopApi, requestDaemon, useMountEffect } from "@/lib";

export function useApplications() {
  const query = useSWR(
    "application.list",
    () => requestDaemon("application.list"),
    { dedupingInterval: 0 },
  );

  useMountEffect(() =>
    desktopApi.onDataChanged((event) => {
      if (event.areas.includes("applications")) void query.mutate();
    }),
  );

  return query;
}
