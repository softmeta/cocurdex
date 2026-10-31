import type {
  DaemonMethod,
  DaemonRequest,
  DaemonResultByMethod,
} from "@cocurdex/rpc";
import type { HostAccessService } from "./host-access-service";
import type { DaemonRequestContext } from "./request-context";

export type HostMethod = Extract<DaemonMethod, `host.${string}`>;

const DEFAULT_AUDIT_LIMIT = 100;

export function isHostRequest(
  request: DaemonRequest,
): request is DaemonRequest<HostMethod> {
  return request.method.startsWith("host.");
}

export async function handleHostRequest(
  hostAccess: HostAccessService,
  request: DaemonRequest<HostMethod>,
  context: DaemonRequestContext,
): Promise<DaemonResultByMethod[HostMethod]> {
  switch (request.method) {
    case "host.identity":
      return hostAccess.identity();
    case "host.session":
      return {
        host: hostAccess.identity(),
        principal: context.principal,
        endpoints: await hostAccess.remoteEndpoints(),
      };
    case "host.remoteAccess.get":
      return hostAccess.remoteAccessStatus();
    case "host.remoteAccess.set":
      return hostAccess.setRemoteAccess(request.params, context.principal);
    case "host.pairing.create":
      return hostAccess.createPairing(request.params, context.principal);
    case "host.pairing.list":
      return hostAccess.listPairings();
    case "host.pairing.cancel":
      return hostAccess.cancelPairing(
        request.params.pairingId,
        context.principal,
      );
    case "host.devices.list":
      return hostAccess.listDevices();
    case "host.devices.revoke":
      return hostAccess.revokeDevice(
        request.params.deviceId,
        context.principal,
      );
    case "host.devices.revokeSelf":
      return hostAccess.revokeSelf(context.principal);
    case "host.devices.updateScopes":
      return hostAccess.updateDeviceScopes(
        request.params.deviceId,
        request.params.scopes,
        context.principal,
      );
    case "host.audit.list":
      return hostAccess.listAudit(request.params.limit ?? DEFAULT_AUDIT_LIMIT);
    default: {
      const exhaustive: never = request;
      throw new Error(`Unsupported host method: ${JSON.stringify(exhaustive)}`);
    }
  }
}
