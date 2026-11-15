import { ReasonError } from "@cocurdex/shared";
import type { DaemonRequestContext } from "../host-access/request-context";

export function assertLocalPrincipal(
  context: DaemonRequestContext,
  method: string,
) {
  if (context.principal.kind !== "local") {
    throw new ReasonError(
      "principal.localOnly",
      `${method} is only available on this computer`,
    );
  }
}

export function assertWorkspaceForRemote(
  context: DaemonRequestContext,
  method: string,
  workspaceId: string | undefined,
) {
  if (context.principal.kind !== "local" && !workspaceId) {
    throw new ReasonError(
      "path.outsideWorkspace",
      `${method} from another device must run in a registered workspace`,
    );
  }
}
