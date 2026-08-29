import type { AgentInputDelivery } from "@cocurdex/shared";

export const followUpBehaviors = ["queue", "steer"] as const;
export type FollowUpBehavior = (typeof followUpBehaviors)[number];

export function isFollowUpBehavior(value: unknown): value is FollowUpBehavior {
  return value === "queue" || value === "steer";
}

export function getAgentInputDelivery(options: {
  behavior: FollowUpBehavior;
  isRunning: boolean;
  supportsSteering?: boolean;
  useOppositeBehavior?: boolean;
}): AgentInputDelivery {
  if (!options.isRunning) return "start-new-run";
  let behavior = options.behavior;
  if (options.useOppositeBehavior) {
    behavior = behavior === "queue" ? "steer" : "queue";
  }
  if (behavior === "steer" && options.supportsSteering !== false) {
    return "steer-active-run";
  }
  return "queue-after-run";
}
