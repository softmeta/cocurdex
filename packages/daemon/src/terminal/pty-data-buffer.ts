import type { PtyDataEvent } from "@cocurdex/shared";

export interface PtyDataBuffer {
  append(terminalId: string, workspaceId: string, data: string): void;
  flush(terminalId: string): void;
  dispose(): void;
}

interface PendingData {
  workspaceId: string;
  chunks: string[];
}

export function createPtyDataBuffer(
  emit: (event: PtyDataEvent) => void,
  flushMs = 8,
): PtyDataBuffer {
  const pending = new Map<string, PendingData>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flushTerminal = (terminalId: string) => {
    const entry = pending.get(terminalId);
    if (!entry) {
      return;
    }
    pending.delete(terminalId);
    emit({
      terminalId,
      workspaceId: entry.workspaceId,
      data: entry.chunks.join(""),
    });
  };

  const flushAll = () => {
    timer = null;
    for (const terminalId of [...pending.keys()]) {
      flushTerminal(terminalId);
    }
  };

  return {
    append(terminalId, workspaceId, data) {
      const entry = pending.get(terminalId);
      if (entry) {
        entry.chunks.push(data);
      } else {
        pending.set(terminalId, { workspaceId, chunks: [data] });
      }
      if (!timer) {
        timer = setTimeout(flushAll, flushMs);
      }
    },
    flush(terminalId) {
      flushTerminal(terminalId);
    },
    dispose() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      pending.clear();
    },
  };
}
