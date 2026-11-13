import useSWR from "swr";
import { desktopApi } from "@/lib";

export function useProviderAuthQuery(
  providerId: string,
  onError: (error: unknown) => void,
) {
  return useSWR(
    ["provider.auth.read", providerId],
    () => desktopApi.readProviderAuth(providerId),
    { dedupingInterval: 0, onError },
  );
}
