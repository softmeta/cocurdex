import { isSupportedLocale } from "@cocurdex/shared";
import i18n from "i18next";
import { useState } from "react";
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
  "followUp.list",
  "personalAgent.told.list",
  "session.lastMessage",
]);

export function usePersonalAgents(hostId: string) {
  return useSWR(
    ["personalAgent.list", hostId] as const,
    ([method, id]) => hostConnection(id).request(method),
    DAEMON_READ,
  );
}

let draftRequest = 0;

export function useAssistantDraft(hostId: string | null) {
  const [request] = useState(() => ++draftRequest);
  return useSWR(
    hostId ? (["personalAgent.draft", hostId, request] as const) : null,
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

export function usePendingFollowUps(hostId: string, agentId: string) {
  return useSWR(
    ["followUp.list", hostId, agentId] as const,
    ([method, id, agent]) =>
      hostConnection(id).request(method, { agentId: agent, status: "pending" }),
    DAEMON_READ,
  );
}

export async function cancelFollowUp(hostId: string, id: string) {
  await hostConnection(hostId).request("followUp.cancel", { id });
  await mutate(
    (key) =>
      Array.isArray(key) && key[0] === "followUp.list" && key[1] === hostId,
  );
}

export function useToldItems(hostId: string, personaId: string) {
  return useSWR(
    ["personalAgent.told.list", hostId, personaId] as const,
    ([method, id, persona]) =>
      hostConnection(id).request(method, { id: persona }),
    DAEMON_READ,
  );
}

export async function forgetToldItem(
  hostId: string,
  personaId: string,
  item: string,
) {
  const items = await hostConnection(hostId).request(
    "personalAgent.told.forget",
    { id: personaId, item },
  );
  await mutate(["personalAgent.told.list", hostId, personaId], items, {
    revalidate: false,
  });
}
