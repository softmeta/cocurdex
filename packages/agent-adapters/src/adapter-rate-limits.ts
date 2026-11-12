import type {
  AgentId,
  AgentRateLimitsReadResult,
  AgentRateLimitsRecord,
} from "@cocurdex/shared";
import { AdapterRateLimitsProbeError } from "./adapter-rate-limits-error";
import { findAgentPlugin } from "./agent-native";

export type AdapterRateLimitsMap = Partial<
  Record<AgentId, AgentRateLimitsReadResult>
>;

export type AdapterRateLimitProbe = (
  agentId: AgentId,
) => (() => Promise<AgentRateLimitsRecord | null>) | null;

const pluginProbe: AdapterRateLimitProbe = (agentId) =>
  findAgentPlugin(agentId)?.readPlanUsage ?? null;

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
  agentIds: readonly AgentId[],
  probeFor: AdapterRateLimitProbe = pluginProbe,
): Promise<AdapterRateLimitsMap> {
  const uniqueIds = [...new Set(agentIds)];
  const entries = await Promise.all(
    uniqueIds.map(async (agentId) => {
      const probe = probeFor(agentId);
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
