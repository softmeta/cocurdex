import { HOST_ACCESS_SCOPES, type HostAccessScope } from "@cocurdex/shared";
import { desktopApi } from "./ipc";

export function hostScopes(): readonly HostAccessScope[] {
  return desktopApi.capabilities.scopes ?? HOST_ACCESS_SCOPES;
}

export function hostHasScope(scope: HostAccessScope) {
  return hostScopes().includes(scope);
}
