import type { PtyDataEvent } from "@cocurdex/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPtyDataBuffer } from "./pty-data-buffer";

describe("createPtyDataBuffer", () => {
  const emitted: PtyDataEvent[] = [];
  const emit = (event: PtyDataEvent) => {
    emitted.push(event);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    emitted.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces rapid chunks into a single event per terminal", () => {
    const buffer = createPtyDataBuffer(emit, 8);
    buffer.append("term-1", "ws-1", "hello ");
    buffer.append("term-1", "ws-1", "world");
    expect(emitted).toHaveLength(0);

    vi.advanceTimersByTime(8);
    expect(emitted).toEqual([
      { terminalId: "term-1", workspaceId: "ws-1", data: "hello world" },
    ]);
  });

  it("keeps terminals separate when flushing", () => {
    const buffer = createPtyDataBuffer(emit, 8);
    buffer.append("term-1", "ws-1", "a");
    buffer.append("term-2", "ws-1", "b");

    vi.advanceTimersByTime(8);
    expect(emitted).toEqual([
      { terminalId: "term-1", workspaceId: "ws-1", data: "a" },
      { terminalId: "term-2", workspaceId: "ws-1", data: "b" },
    ]);
  });

  it("flush(terminalId) emits pending data immediately", () => {
    const buffer = createPtyDataBuffer(emit, 8);
    buffer.append("term-1", "ws-1", "bye");
    buffer.flush("term-1");
    expect(emitted).toEqual([
      { terminalId: "term-1", workspaceId: "ws-1", data: "bye" },
    ]);

    // The timer that was scheduled for this chunk must not re-emit it.
    vi.advanceTimersByTime(8);
    expect(emitted).toHaveLength(1);
  });

  it("schedules a new flush window after the previous one fired", () => {
    const buffer = createPtyDataBuffer(emit, 8);
    buffer.append("term-1", "ws-1", "first");
    vi.advanceTimersByTime(8);
    buffer.append("term-1", "ws-1", "second");
    vi.advanceTimersByTime(8);

    expect(emitted.map((event) => event.data)).toEqual(["first", "second"]);
  });

  it("dispose drops pending data and cancels the timer", () => {
    const buffer = createPtyDataBuffer(emit, 8);
    buffer.append("term-1", "ws-1", "pending");
    buffer.dispose();
    vi.advanceTimersByTime(8);
    expect(emitted).toHaveLength(0);
  });
});
