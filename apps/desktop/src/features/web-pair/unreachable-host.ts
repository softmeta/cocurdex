import { type SavedHost, savedHostSafetyCode } from "@cocurdex/client-runtime";
import { removePairedHost } from "@/lib";
import type { UnreachableHost } from "./web-host-unreachable-screen";

export function savedUnreachableHost(host: SavedHost): UnreachableHost {
  return {
    name: host.name,
    safetyCode: savedHostSafetyCode(host),
    forget: () => removePairedHost(host.hostId),
  };
}
