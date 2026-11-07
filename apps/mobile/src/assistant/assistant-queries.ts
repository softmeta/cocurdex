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
  "personalAgent.work.list",
  "routine.list",
  "session.lastMessage",
]);

export function usePersonalAgents(hostId: string) {
  return useSWR(
    ["personalAgent.list", hostId] as const,
    ([method, id]) => hostConnection(id).request(method),
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

export function greetPersonalAgent(host: SavedHost, id: string) {
  if (!host.scopes.includes("interact")) return;
  void hostConnection(host.hostId)
    .request("personalAgent.greet", {
      id,
      locale: isSupportedLocale(i18n.language) ? i18n.language : null,
    })
    .catch(() => undefined);
}

export function useLatestReply(
  hostId: string,
  sessionId: string,
  stamp: string | null,
) {
  return useSWR(
    stamp ? (["session.lastMessage", hostId, sessionId, stamp] as const) : null,
    ([method, id, session]) =>
      hostConnection(id).request(method, { sessionId: session }),
    DAEMON_READ,
  );
}

export function usePersonalWork(hostId: string, personaId: string) {
  return useSWR(
    ["personalAgent.work.list", hostId, personaId] as const,
    ([method, id, persona]) =>
      hostConnection(id).request(method, { personaId: persona }),
    DAEMON_READ,
  );
}

export function useRoutines(hostId: string, agentId: string) {
  return useSWR(
    ["routine.list", hostId, agentId] as const,
    ([method, id, agent]) =>
      hostConnection(id).request(method, { agentId: agent }),
    DAEMON_READ,
  );
}
