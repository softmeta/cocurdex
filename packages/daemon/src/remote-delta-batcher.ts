import type { DaemonEventEnvelope } from "@cocurdex/rpc";
import type { AgentMessageDeltaEvent } from "@cocurdex/shared";

export const REMOTE_DELTA_DELAY_MS = 100;
export const REMOTE_DELTA_MAX_CHARS = 16 * 1024;

type DeltaEnvelope = DaemonEventEnvelope & { event: AgentMessageDeltaEvent };

export interface RemoteDeltaBatcher {
  send(message: unknown, onSent?: () => void): void;
  pause(): void;
  resume(): void;
  close(): void;
}

function isDeltaEnvelope(message: unknown): message is DeltaEnvelope {
  const envelope = message as Partial<DaemonEventEnvelope> | null;
  return (
    envelope?.type === "daemon.event" &&
    envelope.event?.type === "message.delta"
  );
}

function sameMessage(left: DeltaEnvelope, right: DeltaEnvelope) {
  return (
    left.event.sessionId === right.event.sessionId &&
    left.event.messageId === right.event.messageId &&
    left.event.kind === right.event.kind
  );
}

function merge(previous: DeltaEnvelope, next: DeltaEnvelope): DeltaEnvelope {
  return {
    ...next,
    event: {
      ...next.event,
      delta: `${previous.event.delta}${next.event.delta}`,
    },
  };
}

export function createRemoteDeltaBatcher(
  deliver: (message: unknown, onSent?: () => void) => void,
  delayMs = REMOTE_DELTA_DELAY_MS,
): RemoteDeltaBatcher {
  let pending: DeltaEnvelope | null = null;
  let timer: NodeJS.Timeout | null = null;
  let paused = 0;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const held = pending;
    pending = null;
    if (held) deliver(held);
  };

  return {
    send(message, onSent) {
      if (!isDeltaEnvelope(message) || onSent || paused > 0) {
        flush();
        deliver(message, onSent);
        return;
      }
      if (pending && !sameMessage(pending, message)) flush();
      pending = pending ? merge(pending, message) : message;
      if (pending.event.delta.length >= REMOTE_DELTA_MAX_CHARS) {
        flush();
        return;
      }
      timer ??= setTimeout(flush, delayMs);
    },
    pause() {
      flush();
      paused += 1;
    },
    resume() {
      paused = Math.max(0, paused - 1);
    },
    close() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
    },
  };
}
