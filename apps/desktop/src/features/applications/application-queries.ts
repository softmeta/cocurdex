import useSWR from "swr";
import { requestDaemon } from "@/lib";

export function useApplications() {
  return useSWR("application.list", () => requestDaemon("application.list"), {
    dedupingInterval: 0,
  });
}
