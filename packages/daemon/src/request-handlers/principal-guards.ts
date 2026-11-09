import type { DaemonRequestContext } from "../host-access/request-context";

export function assertLocalPrincipal(
  context: DaemonRequestContext,
  method: string,
) {
  if (context.principal.kind !== "local") {
    throw new Error(`${method} is only available on this computer`);
  }
}

export function assertWorkspaceForRemote(
  context: DaemonRequestContext,
  method: string,
  workspaceId: string | undefined,
) {
  if (context.principal.kind !== "local" && !workspaceId) {
    throw new Error(
      `${method} from another device must run in a registered workspace`,
    );
  }
}
