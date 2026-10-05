import type { AgentId, AgentRateLimitsReadResult } from "@cocurdex/shared";
import { atom } from "jotai";

export const adapterRateLimitsCacheAtom = atom<
  Partial<Record<AgentId, AgentRateLimitsReadResult>>
>({});
