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

export function useAssistantDraft(hostId: string | null) {
  return useSWR(
    hostId ? (["personalAgent.draft", hostId] as const) : null,
    ([method, id]) =>
      hostConnection(id).request(method, {
        locale: isSupportedLocale(i18n.language) ? i18n.language : null,
      }),
    { ...DAEMON_READ, revalidateOnFocus: false },
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
