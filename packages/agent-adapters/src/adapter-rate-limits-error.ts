import type { AgentRateLimitsErrorCode } from "@cocurdex/shared";

export class AdapterRateLimitsProbeError extends Error {
  readonly code: AgentRateLimitsErrorCode;

  constructor(code: AgentRateLimitsErrorCode, message: string) {
    super(message);
    this.name = "AdapterRateLimitsProbeError";
    this.code = code;
  }
}
