import {
  createHostRegistry,
  type HostConnection,
  type LifecycleSignal,
  savedHostEndpoint,
} from "@cocurdex/client-runtime";
import { AppState } from "react-native";
import { hosts } from "@/hosts";

const lifecycle: LifecycleSignal = {
  subscribeForeground(listener) {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") listener();
    });
    return () => subscription.remove();
  },
};

const registry = createHostRegistry();

function pairedHost(hostId: string) {
  const host = hosts.getSnapshot().find((saved) => saved.hostId === hostId);
  if (!host) throw new Error("This computer is no longer paired");
  return host;
}

export function hostConnection(hostId: string): HostConnection {
  return (
    registry.get(hostId) ??
    registry.register({
      hostId,
      platform: {
        lifecycle,
        resolveEndpoint: async () => savedHostEndpoint(pairedHost(hostId)),
      },
    })
  );
}

export const onHostConnectionRemoved = registry.onHostRemoved;

hosts.subscribe(() => {
  const paired = new Set(hosts.getSnapshot().map((host) => host.hostId));
  for (const connection of registry.list()) {
    if (!paired.has(connection.hostId)) registry.remove(connection.hostId);
  }
});
