import type { AgentDescriptor } from "@cocurdex/shared";
import { type AdapterStatusKind, getAdapterStatus } from "@/features/sessions";

/** 需要用户处理的状态靠前；同优先级保持传入顺序。 */
const kindOrder: Record<AdapterStatusKind, number> = {
  error: 0,
  missing: 1,
  outdated: 2,
  detecting: 3,
  ready: 4,
  builtin: 5,
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
