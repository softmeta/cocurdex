import type { AgentEvent, AgentMessageDeltaEvent } from "@cocurdex/shared";

const FLUSH_DELAY_MS = 16;

export interface EventBroadcastCoalescer {
  push(event: AgentEvent): void;
  flush(): void;
}

export function createEventBroadcastCoalescer(
  send: (event: AgentEvent) => void,
): EventBroadcastCoalescer {
  const pending = new Map<string, AgentMessageDeltaEvent>();
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

  return {
    push(event) {
      if (event.type !== "message.delta") {
        flush();
        send(event);
        return;
      }

      const key = `${event.sessionId}:${event.messageId}`;
      const previous = pending.get(key);
      pending.set(
        key,
        previous
          ? { ...previous, delta: `${previous.delta}${event.delta}` }
          : event,
      );

      if (!timer) {
        timer = setTimeout(flush, FLUSH_DELAY_MS);
      }
    },
    flush,
  };
}
