import { useState } from "react";
import { webPairedHost } from "@/lib";
import { DeviceApprovalDialog } from "./device-approval-dialog";
import { usePendingDevices } from "./pending-devices-query";

export function DeviceApprovalPrompt() {
  if (webPairedHost()) return null;
  return <LocalDeviceApprovalPrompt />;
}

function LocalDeviceApprovalPrompt() {
  const { pending, revalidate } = usePendingDevices();
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const device = pending.find((candidate) => !dismissed.has(candidate.id));
  if (!device) return null;

  return (
    <DeviceApprovalDialog
      device={device}
      key={device.id}
      onClose={() => setDismissed((ids) => new Set(ids).add(device.id))}
      onSettled={revalidate}
    />
  );
}
