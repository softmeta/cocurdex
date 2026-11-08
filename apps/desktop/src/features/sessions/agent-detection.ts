import type { AgentDescriptor } from "@cocurdex/shared";
import { atom } from "jotai";
import { desktopApi } from "@/lib";
import { bootstrapAgentsAtom } from "./session-agent-state";

const AGENT_REDETECT_AFTER_MS = 30_000;

const agentsDetectedAtAtom = atom(0);
let pendingDetection: Promise<AgentDescriptor[]> | null = null;

export const detectAgentsAtom = atom(null, (_get, set) => {
  pendingDetection ??= desktopApi
    .listAgents()
    .then((agents) => {
      set(bootstrapAgentsAtom, agents);
      set(agentsDetectedAtAtom, Date.now());
      return agents;
    })
    .finally(() => {
      pendingDetection = null;
    });
  return pendingDetection;
});

export const redetectStaleAgentsAtom = atom(null, (get, set) => {
  if (Date.now() - get(agentsDetectedAtAtom) < AGENT_REDETECT_AFTER_MS) {
    return;
  }
  void set(detectAgentsAtom).catch(() => undefined);
});
