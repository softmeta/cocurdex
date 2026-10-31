import { hostConnection } from "@/connection";
import { hosts } from "@/hosts";

const REVOKE_TIMEOUT_MS = 5000;

export async function unpairHost(hostId: string) {
  const revoked = await hostConnection(hostId)
    .request("host.devices.revokeSelf", undefined, {
      timeoutMs: REVOKE_TIMEOUT_MS,
    })
    .then(() => true)
    .catch(() => false);
  hosts.remove(hostId);
  return revoked;
}
