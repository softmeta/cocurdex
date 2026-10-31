import type { AgentId, SessionKind } from "./contracts";

export const AGENT_RUN_LIMITS_SETTING_KEY = "agents.runLimits";

export interface AgentRunLimits {
  maxConcurrentRuns: number;
  maxConcurrentRunsPerAgent: number;
  delegatedRunTimeoutMinutes: number | null;
}

export const DEFAULT_AGENT_RUN_LIMITS: AgentRunLimits = {
  maxConcurrentRuns: 8,
  maxConcurrentRunsPerAgent: 4,
  delegatedRunTimeoutMinutes: 60,
};

export const AGENT_RUN_LIMIT_BOUNDS = {
  maxConcurrentRuns: { min: 1, max: 64 },
  maxConcurrentRunsPerAgent: { min: 1, max: 64 },
  delegatedRunTimeoutMinutes: { min: 1, max: 24 * 60 },
} as const;

function boundedInteger(
  value: unknown,
  bounds: { min: number; max: number },
): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value >= bounds.min && value <= bounds.max ? value : null;
}

export function parseAgentRunLimits(value: unknown): AgentRunLimits | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const maxConcurrentRuns = boundedInteger(
    record.maxConcurrentRuns,
    AGENT_RUN_LIMIT_BOUNDS.maxConcurrentRuns,
  );
  const maxConcurrentRunsPerAgent = boundedInteger(
    record.maxConcurrentRunsPerAgent,
    AGENT_RUN_LIMIT_BOUNDS.maxConcurrentRunsPerAgent,
  );
  const timeout =
    record.delegatedRunTimeoutMinutes === null
      ? null
      : boundedInteger(
          record.delegatedRunTimeoutMinutes,
          AGENT_RUN_LIMIT_BOUNDS.delegatedRunTimeoutMinutes,
        );
  if (maxConcurrentRuns === null || maxConcurrentRunsPerAgent === null) {
    return null;
  }
  if (timeout === null && record.delegatedRunTimeoutMinutes !== null) {
    return null;
  }
  return {
    maxConcurrentRuns,
    maxConcurrentRunsPerAgent,
    delegatedRunTimeoutMinutes: timeout,
  };
}

export function resolveAgentRunLimits(stored: unknown): AgentRunLimits {
  return parseAgentRunLimits(stored) ?? DEFAULT_AGENT_RUN_LIMITS;
}

export function resolveStoredAgentRunLimits(raw: string | null) {
  if (!raw) return DEFAULT_AGENT_RUN_LIMITS;
  try {
    return resolveAgentRunLimits(JSON.parse(raw));
  } catch {
    return DEFAULT_AGENT_RUN_LIMITS;
  }
}

export function isDelegatedSession(session: {
  sessionKind?: SessionKind | null;
  parentSessionId?: string | null;
}) {
  return (
    (session.sessionKind ?? "main") !== "main" &&
    Boolean(session.parentSessionId)
  );
}

export type RunAdmission =
  | { admit: true }
  | { admit: false; limit: "host" | "agent" };

export function decideRunAdmission(input: {
  agentType: AgentId;
  activeAgentTypes: readonly AgentId[];
  limits: AgentRunLimits;
}): RunAdmission {
  if (input.activeAgentTypes.length >= input.limits.maxConcurrentRuns) {
    return { admit: false, limit: "host" };
  }
  const sameAgent = input.activeAgentTypes.filter(
    (agentType) => agentType === input.agentType,
  ).length;
  if (sameAgent >= input.limits.maxConcurrentRunsPerAgent) {
    return { admit: false, limit: "agent" };
  }
  return { admit: true };
}

export function delegatedRunTimeoutMs(limits: AgentRunLimits) {
  return limits.delegatedRunTimeoutMinutes === null
    ? null
    : limits.delegatedRunTimeoutMinutes * 60_000;
}
