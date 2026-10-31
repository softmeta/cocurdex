import type { HostPrincipal } from "@cocurdex/shared";

export interface DaemonRequestContext {
  principal: HostPrincipal;
  remoteAddress: string | null;
}

export const LOCAL_REQUEST_CONTEXT: DaemonRequestContext = {
  principal: { kind: "local" },
  remoteAddress: null,
};
