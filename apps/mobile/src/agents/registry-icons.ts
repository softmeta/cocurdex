import { useSyncExternalStore } from "react";

const REGISTRY_ICON_BASE_URL =
  "https://cdn.agentclientprotocol.com/registry/v1/latest/";

type IconState = string | null | undefined;

const icons = new Map<string, IconState>();
const listeners = new Set<() => void>();

function publish(registryId: string, xml: string | null) {
  icons.set(registryId, xml);
  for (const listener of [...listeners]) listener();
}

async function load(registryId: string) {
  icons.set(registryId, undefined);
  try {
    const response = await fetch(
      `${REGISTRY_ICON_BASE_URL}${encodeURIComponent(registryId)}.svg`,
    );
    const xml = response.ok ? await response.text() : "";
    publish(registryId, xml.includes("<svg") ? xml : null);
  } catch {
    publish(registryId, null);
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useRegistryIcon(registryId: string | null): IconState {
  const state = useSyncExternalStore(subscribe, () =>
    registryId ? icons.get(registryId) : null,
  );
  if (registryId && !icons.has(registryId)) void load(registryId);
  return state;
}
