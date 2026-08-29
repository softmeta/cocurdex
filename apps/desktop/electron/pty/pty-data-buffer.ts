import type { PtyDataEvent } from "@cocurdex/shared";

export interface PtyDataBuffer {
  /** Accumulate a pty output chunk; delivery happens on the next flush tick. */
  append(terminalId: string, workspaceId: string, data: string): void;
  /** Emit a terminal's pending data immediately (e.g. right before exit). */
  flush(terminalId: string): void;
  /** Drop all pending data and cancel the timer (window closed). */
  dispose(): void;
}

interface PendingData {
  workspaceId: string;
  chunks: string[];
}

// node-pty emits a data event per read — fast producers (builds, `cat` on a
// large file) generate thousands of chunks per second, and forwarding each one
// as its own webContents.send floods the IPC channel and the renderer's xterm
// write path. Coalescing chunks into one event per terminal per tick keeps
// throughput high while the added latency stays below a frame.
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
