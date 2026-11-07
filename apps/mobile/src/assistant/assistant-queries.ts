import type { SavedHost } from "@cocurdex/client-runtime";
import { isSupportedLocale } from "@cocurdex/shared";
import i18n from "i18next";
import useSWR, { mutate } from "swr";
import { hostConnection } from "@/connection";

const DAEMON_READ = { dedupingInterval: 0 };
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const ASSISTANT_METHODS = new Set([
  "personalAgent.list",
  "inbox.list",
  "inbox.brief",
]);

export function usePersonalAgents(host: SavedHost, defaultName: string) {
  const canCreate = host.scopes.includes("interact");
  return useSWR(
    ["personalAgent.list", host.hostId, canCreate, defaultName] as const,
    async ([method, hostId, create, name]) => {
      const connection = hostConnection(hostId);
      const agents = await connection.request(method);
      if (agents.length > 0 || !create) return agents;
      await connection.request("personalAgent.ensureDefault", {
        name,
        locale: isSupportedLocale(i18n.language) ? i18n.language : null,
      });
      return connection.request(method);
    },
    DAEMON_READ,
  );
}

export function useInbox(hostId: string) {
  return useSWR(
    ["inbox.list", hostId] as const,
    ([method, id]) => hostConnection(id).request(method),
    DAEMON_READ,
  );
}

export function useBrief(hostId: string) {
  return useSWR(
    ["inbox.brief", hostId, timeZone] as const,
    ([method, id, zone]) =>
      hostConnection(id).request(method, { timeZone: zone }),
    DAEMON_READ,
  );
}

export function revalidateAssistant(hostId: string) {
  return mutate(
    (key) =>
      Array.isArray(key) && ASSISTANT_METHODS.has(key[0]) && key[1] === hostId,
  );
}

export async function readInboxItem(hostId: string, id: string) {
  await hostConnection(hostId).request("inbox.read", { id });
  await revalidateAssistant(hostId);
}
