import type { PairedDevice } from "@cocurdex/shared";
import useSWR from "swr";
import { desktopApi, useMountEffect } from "@/lib";

const PENDING_DEVICES_KEY = "host.devices.list:pending";
const PENDING_REFRESH_MS = 30_000;
const NO_PENDING: PairedDevice[] = [];

async function loadPendingDevices() {
  const devices = await desktopApi.listHostDevices();
  return devices.filter((device) => device.approvalExpiresAt !== null);
}

export function usePendingDevices() {
  const { data, mutate } = useSWR(PENDING_DEVICES_KEY, loadPendingDevices, {
    dedupingInterval: 0,
    refreshInterval: (latest) =>
      latest && latest.length > 0 ? PENDING_REFRESH_MS : 0,
  });

  useMountEffect(() =>
    desktopApi.onDataChanged((event) => {
      if (event.areas.includes("settings")) void mutate();
    }),
  );

  return {
    pending: data ?? NO_PENDING,
    revalidate: () => void mutate(),
  };
}
