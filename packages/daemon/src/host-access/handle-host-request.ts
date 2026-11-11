import type {
  DaemonMethod,
  DaemonRequest,
  DaemonResultByMethod,
} from "@cocurdex/rpc";
import type { DelegationModule } from "../delegation";
import type { PushService } from "../push";
import type { RemoteHosts } from "../remote-hosts";
import type { HostAccessService } from "./host-access-service";
import type { DaemonRequestContext } from "./request-context";
import type { TrafficMeter } from "./traffic-meter";

export type HostMethod = Extract<DaemonMethod, `host.${string}`>;

const DEFAULT_AUDIT_LIMIT = 100;

export function isHostRequest(
  request: DaemonRequest,
): request is DaemonRequest<HostMethod> {
  return request.method.startsWith("host.");
}

export interface HostRequestServices {
  hostAccess: HostAccessService;
  push: PushService;
  remoteTraffic: TrafficMeter;
  remoteHosts: RemoteHosts;
  delegations: Pick<DelegationModule, "forgetHost" | "pollRemote">;
}

export async function handleHostRequest(
  services: HostRequestServices,
  request: DaemonRequest<HostMethod>,
  context: DaemonRequestContext,
): Promise<DaemonResultByMethod[HostMethod]> {
  const { hostAccess, push, remoteTraffic, remoteHosts } = services;
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
    case "host.relay.set":
      return hostAccess.setRelay(request.params, context.principal);
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
    case "host.devices.approve":
      return hostAccess.approveDevice(
        request.params.deviceId,
        request.params.code,
        context.principal,
      );
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
    case "host.traffic.get":
      return remoteTraffic.report();
    case "host.traffic.reset":
      return remoteTraffic.reset();
    case "host.push.get":
      return push.status();
    case "host.push.set":
      return push.setSettings(request.params);
    case "host.push.register":
      return push.register(context.principal, request.params);
    case "host.push.unregister":
      return push.unregister(context.principal);
    case "host.remotes.list":
      return remoteHosts.list();
    case "host.remotes.pair":
      return remoteHosts.pair(request.params);
    case "host.remotes.remove": {
      const removed = await remoteHosts.remove(request.params.hostId);
      if (removed) services.delegations.forgetHost(request.params.hostId);
      return removed;
    }
    case "host.remotes.endpoint":
      return remoteHosts.endpoint(request.params.hostId);
    case "host.remotes.workspaces":
      return remoteHosts.request(
        request.params.hostId,
        "delegation.remote.catalog",
        undefined,
      );
    default: {
      const exhaustive: never = request;
      throw new Error(`Unsupported host method: ${JSON.stringify(exhaustive)}`);
    }
  }
}
