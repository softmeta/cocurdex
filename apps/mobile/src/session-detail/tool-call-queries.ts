import useSWR from "swr";
import { hostConnection } from "@/connection";

const RESULT_READ = { dedupingInterval: 0, keepPreviousData: true };

export function useToolCallResult(
  hostId: string,
  toolCallId: string,
  version: string | null,
) {
  return useSWR(
    version === null
      ? null
      : (["session.getToolCallResult", hostId, toolCallId, version] as const),
    ([method, host, id]) =>
      hostConnection(host).request(method, { toolCallId: id }),
    RESULT_READ,
  );
}
