import type { AgentInputDelivery, MessageRecord } from "@cocurdex/shared";
import type { SessionTurnOutcome } from "./execution-types";

export type DeliveryDecision =
  | { kind: "start" }
  | { kind: "steer" }
  | { kind: "queue" }
  | { kind: "reject"; reason: "active-run" | "no-active-run" };

export function decideDelivery(input: {
  requested: AgentInputDelivery | undefined;
  hasActiveRun: boolean;
  fromPeer?: boolean;
  hold?: boolean;
}): DeliveryDecision {
  const { requested, hasActiveRun } = input;
  if (input.hold) return { kind: "queue" };
  if (!hasActiveRun) {
    if (requested === "steer-active-run" && !input.fromPeer) {
      return { kind: "reject", reason: "no-active-run" };
    }
    return { kind: "start" };
  }
  if (requested === "steer-active-run") return { kind: "steer" };
  if (requested === "queue-after-run") return { kind: "queue" };
  return { kind: "reject", reason: "active-run" };
}

export type RunSettlement =
  | { kind: "resolved"; message: MessageRecord | null }
  | { kind: "rejected"; error: string };

export function decideRunOutcome(input: {
  settlement: RunSettlement;
  stopped?: boolean;
  providerFailure?: string | null;
}): SessionTurnOutcome {
  const { settlement } = input;
  if (input.stopped) return { status: "cancelled" };
  if (settlement.kind === "rejected") {
    return { status: "failed", error: settlement.error };
  }
  if (input.providerFailure) {
    return { status: "failed", error: input.providerFailure };
  }
  if (!settlement.message) return { status: "cancelled" };
  return { status: "completed", message: settlement.message };
}
