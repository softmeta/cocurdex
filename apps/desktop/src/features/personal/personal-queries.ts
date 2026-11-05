import type { PersonalAgentRecord } from "@cocurdex/shared";
import useSWR from "swr";
import { desktopApi, useMountEffect } from "@/lib";
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
