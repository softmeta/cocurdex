import { useSyncExternalStore } from "react";
import { installMarker, secureStorage } from "@/storage";
import { pickCurrentHost } from "./current-host";
import {
  createHostsStore,
  forgetHostsFromPreviousInstall,
} from "./hosts-store";

const CURRENT_HOST_KEY = "cocurdex.currentHost";

export const hosts = createHostsStore(secureStorage);
forgetHostsFromPreviousInstall(installMarker, hosts);

let selectedHostId = secureStorage.getItem(CURRENT_HOST_KEY);
const selectionListeners = new Set<() => void>();

function subscribeSelection(listener: () => void) {
  selectionListeners.add(listener);
  return () => {
    selectionListeners.delete(listener);
  };
}

export function selectHost(hostId: string) {
  selectedHostId = hostId;
  secureStorage.setItem(CURRENT_HOST_KEY, hostId);
  for (const listener of [...selectionListeners]) listener();
}

export function useSavedHosts() {
  return useSyncExternalStore(hosts.subscribe, hosts.getSnapshot);
}

export function useCurrentHost() {
  const saved = useSavedHosts();
  const selected = useSyncExternalStore(
    subscribeSelection,
    () => selectedHostId,
  );
  return pickCurrentHost(saved, selected);
}
