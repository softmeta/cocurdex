import type {
  PushNotificationKind,
  RoutineDeliver,
  RoutineRunRecord,
  SessionKind,
} from "@cocurdex/shared";
import { routineReportNeedsUser } from "@cocurdex/shared";
import { routinePushAllowed } from "../routines";

export type AlertSource = "turn" | "routine";

export interface AlertTarget {
  sessionKind: SessionKind | null | undefined;
  personaMuted: boolean;
  routineDeliver: RoutineDeliver | null;
}

const NEEDS_ANSWER: readonly PushNotificationKind[] = [
  "approval",
  "question",
  "plan",
];

export function alertAllowed(
  target: AlertTarget,
  kind: PushNotificationKind,
  source: AlertSource,
) {
  if (target.sessionKind === "subagent" || target.personaMuted) return false;
  if (target.routineDeliver === null) return true;
  if (source === "turn") return NEEDS_ANSWER.includes(kind);
  return routinePushAllowed(target.routineDeliver, kind);
}

export function routineRunAlert(
  run: RoutineRunRecord,
): { kind: PushNotificationKind; detail: string | null } | null {
  if (run.status === "failed") return { kind: "turnFailed", detail: run.error };
  if (run.status !== "succeeded" || run.outcome === "dropped") return null;
  if (routineReportNeedsUser(run.outcome)) {
    return { kind: "question", detail: run.question ?? run.summary };
  }
  return { kind: "turnCompleted", detail: run.summary };
}
