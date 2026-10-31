import type { EntityRef } from "@cocurdex/shared";
import useSWR from "swr";
import { hostConnection } from "@/connection";

export function useEntityLinks(hostId: string, ref: EntityRef) {
  return useSWR(
    ["link.list", hostId, ref.kind, ref.id] as const,
    ([method, host, kind, id]) =>
      hostConnection(host).request(method, { ref: { kind, id } }),
    { dedupingInterval: 0 },
  );
}
