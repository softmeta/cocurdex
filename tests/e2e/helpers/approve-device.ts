import { type SavedHost, savedHostSafetyCode } from "@cocurdex/client-runtime";
import { requestDaemon } from "@cocurdex/daemon/client";
import type { DaemonProcess } from "@cocurdex/test-harness/helpers/daemon-process";

export async function approveDevice(
  daemon: Pick<DaemonProcess, "options">,
  host: SavedHost,
) {
  const approval = await requestDaemon(
    "host.devices.approve",
    { deviceId: host.deviceId, code: savedHostSafetyCode(host) },
    daemon.options,
  );
  if (!approval.ok) {
    throw new Error(`Device approval failed: ${approval.reason}`);
  }
  return host;
}
