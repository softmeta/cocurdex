import type { PersonalAgentRecord } from "@cocurdex/shared";
import useSWR, { mutate as mutateGlobal } from "swr";
import { desktopApi, requestDaemon, useMountEffect } from "@/lib";
import { personalApi } from "./personal-api";

const PERSONAL_AGENTS_KEY = "personalAgent.list";
const NO_AGENTS: PersonalAgentRecord[] = [];

async function loadPersonalAgents(defaultName: string) {
  const agents = await personalApi.list();
  if (agents.some((agent) => agent.isDefault)) return agents;
  await personalApi.ensureDefault(defaultName);
  return personalApi.list();
}

export function usePersonalAgents(defaultName: string) {
  const { data, mutate } = useSWR(
    PERSONAL_AGENTS_KEY,
    () => loadPersonalAgents(defaultName),
    { dedupingInterval: 0 },
  );

  useMountEffect(() =>
    desktopApi.onDataChanged((event) => {
      if (event.areas.includes("personal")) void mutate();
    }),
  );

  return {
    agents: data ?? NO_AGENTS,
    loaded: data !== undefined,
    revalidate: () => mutate(),
  };
}

export function revalidatePersonalAgents() {
  return mutateGlobal(PERSONAL_AGENTS_KEY);
}

export function usePersonaRole(roleId: string | null, defaultName: string) {
  const { data } = useSWR(
    roleId ? PERSONAL_AGENTS_KEY : null,
    () => loadPersonalAgents(defaultName),
    { dedupingInterval: 0 },
  );
  return data?.find((agent) => agent.role.id === roleId)?.role ?? null;
}

export function useLatestReply(sessionId: string, stamp: string | null) {
  const { data } = useSWR(
    stamp ? ["session.lastMessage", sessionId, stamp] : null,
    () => requestDaemon("session.lastMessage", { sessionId }),
    { dedupingInterval: 0, keepPreviousData: true },
  );
  return data ?? null;
}
