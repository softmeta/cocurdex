import useSWR from "swr";
import { desktopApi } from "@/lib";

export const ACP_REGISTRY_UPDATES_KEY = ["acpRegistry.updates"] as const;

export function useAcpRegistryUpdates() {
  return useSWR(
    ACP_REGISTRY_UPDATES_KEY,
    () => desktopApi.listAcpRegistryUpdates(),
    { dedupingInterval: 0, revalidateOnFocus: false },
  );
}
