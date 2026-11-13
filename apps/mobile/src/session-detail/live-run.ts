import { type ActivityKind, getActivityState } from "@cocurdex/client-runtime";
import type {
  AgentTurnCompletedEvent,
  MessageRecord,
  SessionObservationSnapshot,
} from "@cocurdex/shared";
import type { CondensedItem, LivePhase } from "./transcript-activity";

export type SessionPresentation = "work" | "chat" | "assistant";

export function livePhase(
  presentation: SessionPresentation,
  kind: ActivityKind,
): LivePhase {
  if (kind === "responding") return "responding";
  if (kind === "thinking") return "thinking";
  if (kind === "planning" && presentation !== "work") return "thinking";
  return "working";
}

export function observedMessages(
  observation: SessionObservationSnapshot | null,
): MessageRecord[] {
  if (!observation) return [];
  const finished = new Set(observation.messages.map((message) => message.id));
  return [
    ...observation.messages,
    ...observation.activeMessages.filter(
      (message) => !finished.has(message.id),
    ),
  ];
}

export function observedPhase(
  presentation: SessionPresentation,
  observation: SessionObservationSnapshot | null,
  running: boolean,
  responseStalled: boolean,
): LivePhase {
  if (!observation) return livePhase(presentation, "planning");
  const { kind } = getActivityState({
    isRunning: running,
    messages: observedMessages(observation),
    responseStalled,
    status: observation.session.status,
    toolCalls: [...observation.toolCalls],
  });
  return livePhase(presentation, kind);
}

export function withTurnEnds(
  items: readonly CondensedItem[],
  turnStats: Readonly<Record<string, AgentTurnCompletedEvent>>,
  durations: boolean,
): CondensedItem[] {
  return items.map((item) => {
    if (item.kind !== "assistant" || !item.turnEnd) return item;
    const stats = turnStats[item.id];
    if (!stats) return item;
    return {
      ...item,
      turn: {
        durationMs: durations ? stats.durationMs : null,
        stopped: stats.stopReason === "cancelled",
      },
    };
  });
}
