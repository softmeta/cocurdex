import {
  type AgentId,
  type AgentRateLimitsReadResult,
  type AgentRateLimitsRecord,
  isPlanUsageAgentId,
  PLAN_USAGE_AGENT_IDS,
  type PlanUsageAgentId,
} from "@cocurdex/shared";
import { readAcpRegistryRateLimits } from "./acp-registry";
import { AdapterRateLimitsProbeError } from "./adapter-rate-limits-error";
import { readClaudePlanUsage } from "./claude-cli/claude-plan-usage-probe";
import { readCodexRateLimits } from "./codex/codex-rate-limits";

export type AdapterRateLimitsMap = Partial<
  Record<AgentId, AgentRateLimitsReadResult>
>;

export type AdapterRateLimitProbes = Record<
  PlanUsageAgentId,
  () => Promise<AgentRateLimitsRecord | null>
>;

const defaultProbes: AdapterRateLimitProbes = {
  "claude-agent": readClaudePlanUsage,
  codex: readCodexRateLimits,
  "acp:grok-build": () => readAcpRegistryRateLimits("acp:grok-build"),
};

function toProbeError(error: unknown): AgentRateLimitsReadResult {
  if (error instanceof AdapterRateLimitsProbeError) {
    return {
      status: "error",
      code: error.code,
      message: error.message,
    };
  }

  return {
    status: "error",
    code: "probe-failed",
    message: error instanceof Error ? error.message : String(error),
  };
}

export async function readAdapterRateLimits(
  agentIds: readonly AgentId[] = PLAN_USAGE_AGENT_IDS,
  probes: AdapterRateLimitProbes = defaultProbes,
): Promise<AdapterRateLimitsMap> {
  const uniqueIds = [...new Set(agentIds)];
  const entries = await Promise.all(
    uniqueIds.map(async (agentId) => {
      const probe = isPlanUsageAgentId(agentId) ? probes[agentId] : null;
      if (!probe) {
        return [agentId, null] as const;
      }
      try {
        const rateLimits = await probe();
        const result: AgentRateLimitsReadResult = rateLimits
          ? { status: "available", rateLimits }
          : { status: "unavailable" };
        return [agentId, result] as const;
      } catch (error) {
        return [agentId, toProbeError(error)] as const;
      }
    }),
  );
  return Object.fromEntries(entries) as AdapterRateLimitsMap;
}
