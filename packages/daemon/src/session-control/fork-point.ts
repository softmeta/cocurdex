import type { MessageRecord } from "@cocurdex/shared";

export interface ForkPointInput {
  settled: readonly MessageRecord[];
  throughMessageId?: string;
  activeTriggerMessageId: string | null;
}

export interface ForkPoint {
  included: MessageRecord[];
  userTurnCount: number | null;
}

function completedTurns(input: ForkPointInput) {
  const { settled, activeTriggerMessageId } = input;
  if (!activeTriggerMessageId) return settled;
  const activeIndex = settled.findIndex(
    (message) => message.id === activeTriggerMessageId,
  );
  return activeIndex < 0 ? settled : settled.slice(0, activeIndex);
}

function endOfTurn(messages: readonly MessageRecord[], index: number) {
  const next = messages.findIndex(
    (message, position) => position > index && message.role === "user",
  );
  return next < 0 ? messages.length : next;
}

export function resolveForkPoint(input: ForkPointInput): ForkPoint {
  const completed = completedTurns(input);
  let included: MessageRecord[] = [...completed];
  if (input.throughMessageId) {
    const index = input.settled.findIndex(
      (message) => message.id === input.throughMessageId,
    );
    if (index < 0) {
      throw new Error(`Message ${input.throughMessageId} was not found`);
    }
    if (index >= completed.length) {
      throw new Error("Wait for this turn to finish before forking from it");
    }
    included = completed.slice(0, endOfTurn(completed, index));
  }
  if (included.length === 0) {
    throw new Error("Wait for the first turn to finish before forking");
  }
  const latest = included.length === input.settled.length;
  return {
    included,
    userTurnCount: latest
      ? null
      : included.filter((message) => message.role === "user").length,
  };
}
