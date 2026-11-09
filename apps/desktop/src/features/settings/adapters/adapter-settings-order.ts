import type { AgentDescriptor } from "@cocurdex/shared";
import { type AdapterStatusKind, getAdapterStatus } from "@/features/sessions";

const kindOrder: Record<AdapterStatusKind, number> = {
  builtin: 0,
  error: 1,
  missing: 2,
  outdated: 3,
  detecting: 4,
  ready: 5,
  disabled: 6,
};

export function sortAdaptersForSettings(
  agents: readonly AgentDescriptor[],
): AgentDescriptor[] {
  return agents
    .map((agent, index) => ({ agent, index }))
    .sort((left, right) => {
      const kindDelta =
        kindOrder[getAdapterStatus(left.agent).kind] -
        kindOrder[getAdapterStatus(right.agent).kind];
      if (kindDelta !== 0) {
        return kindDelta;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.agent);
}

export function splitAdaptersForSettings(agents: readonly AgentDescriptor[]) {
  const sorted = sortAdaptersForSettings(agents);
  const isMissing = (agent: AgentDescriptor) =>
    getAdapterStatus(agent).kind === "missing";
  return {
    installed: sorted.filter((agent) => !isMissing(agent)),
    missing: sorted.filter(isMissing),
  };
}
