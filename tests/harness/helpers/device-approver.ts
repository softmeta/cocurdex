import {
  type RequestClientOptions,
  requestDaemon,
} from "@cocurdex/daemon/client";
import { decodeBase64Url, pairingSafetyCode } from "@cocurdex/secure-channel";

const APPROVER_POLL_MS = 200;

async function approvePendingDevices(
  options: RequestClientOptions,
  hostKey: string,
) {
  const devices = await requestDaemon("host.devices.list", options);
  for (const device of devices) {
    if (!device.approvalExpiresAt || !device.publicKey) continue;
    await requestDaemon(
      "host.devices.approve",
      {
        deviceId: device.id,
        code: pairingSafetyCode(
          decodeBase64Url(hostKey),
          decodeBase64Url(device.publicKey),
        ),
      },
      options,
    );
  }
}

export function startDeviceApprover(
  options: RequestClientOptions,
  hostKey: string,
) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const tick = async () => {
    await approvePendingDevices(options, hostKey).catch(() => {});
    if (!stopped) timer = setTimeout(() => void tick(), APPROVER_POLL_MS);
  };
  void tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
