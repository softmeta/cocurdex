import type {
  AgentEvent,
  AgentMessageDeltaEvent,
  AgentToolStartedEvent,
  AgentToolUpdatedEvent,
} from "@cocurdex/shared";

const FLUSH_DELAY_MS = 16;

type ToolProgressEvent = AgentToolStartedEvent | AgentToolUpdatedEvent;
type CoalescedEvent = AgentMessageDeltaEvent | ToolProgressEvent;

export interface EventBroadcastCoalescer {
  push(event: AgentEvent): void;
  flush(): void;
}

function mergeToolProgress(
  previous: CoalescedEvent | undefined,
  next: ToolProgressEvent,
): ToolProgressEvent {
  return previous?.type === "tool.started"
    ? { ...next, type: "tool.started" }
    : next;
}

export function createEventBroadcastCoalescer(
  send: (event: AgentEvent) => void,
): EventBroadcastCoalescer {
  const pending = new Map<string, CoalescedEvent>();
  let timer: NodeJS.Timeout | null = null;

  function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    for (const event of pending.values()) {
      send(event);
    }
    pending.clear();
  }

  function schedule() {
    if (!timer) {
      timer = setTimeout(flush, FLUSH_DELAY_MS);
    }
  }

  return {
    push(event) {
      if (event.type === "tool.started" || event.type === "tool.updated") {
        const key = `tool:${event.sessionId}:${event.toolCall.id}`;
        pending.set(key, mergeToolProgress(pending.get(key), event));
        schedule();
        return;
      }

      if (event.type !== "message.delta") {
        flush();
        send(event);
        return;
      }

      const key = `message:${event.sessionId}:${event.messageId}`;
      const previous = pending.get(key);
      pending.set(
        key,
        previous?.type === "message.delta"
          ? { ...previous, delta: `${previous.delta}${event.delta}` }
          : event,
      );
      schedule();
    },
    flush,
  };
}
