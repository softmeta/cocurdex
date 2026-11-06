import type { PushNotificationKind, RoutineDeliver } from "@cocurdex/shared";

const NEEDS_ANSWER: readonly PushNotificationKind[] = [
  "approval",
  "question",
  "plan",
];

export function routinePushAllowed(
  deliver: RoutineDeliver,
  kind: PushNotificationKind,
) {
  if (deliver === "push" || NEEDS_ANSWER.includes(kind)) return true;
  return deliver === "inbox" && kind === "turnFailed";
}
