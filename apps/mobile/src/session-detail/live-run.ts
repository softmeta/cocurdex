import { type ActivityKind, getActivityState } from "@cocurdex/client-runtime";
import type {
  AgentTurnCompletedEvent,
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

export function observedPhase(
  presentation: SessionPresentation,
  observation: SessionObservationSnapshot | null,
  running: boolean,
): LivePhase {
  if (!observation) return livePhase(presentation, "planning");
  const finished = new Set(observation.messages.map((message) => message.id));
  const { kind } = getActivityState({
    isRunning: running,
    messages: [
      ...observation.messages,
      ...observation.activeMessages.filter(
        (message) => !finished.has(message.id),
      ),
    ],
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
