import type {
  AgentToolCallRecord,
  AgentToolCallResult,
} from "@cocurdex/shared";
import { createStore } from "jotai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { desktopApi } from "@/lib/ipc";
import {
  observeToolCallResultAtom,
  toolCallResultCacheAtom,
} from "./tool-call-result-store";
import {
  applyToolEventAtom,
  bootstrapToolCallsAtom,
  clearToolCallsForSessionAtom,
  loadSessionToolCallsAtom,
  toolCallsBySessionAtom,
  toolCallsLoadedBySessionAtom,
} from "./tool-call-store";

afterEach(() => vi.restoreAllMocks());

function toolCall(
  overrides: Partial<AgentToolCallRecord> = {},
): AgentToolCallRecord {
  return {
    id: "tool-1",
    sessionId: "session-1",
    title: "Run command",
    status: "completed",
    content: [{ type: "text", text: "Full output" }],
    rawOutput: { output: "Full raw output" },
    locations: [],
    startedAt: "2026-09-09T00:00:00.000Z",
    updatedAt: "2026-09-09T00:00:01.000Z",
    ...overrides,
  };
}

const result: AgentToolCallResult = {
  content: [{ type: "text", text: "Fetched output" }],
  rawOutput: null,
};
const subscription = { toolCallId: "tool-1", sessionId: "session-1" };

function pendingResult() {
  let resolve: (value: AgentToolCallResult | null) => void = () => {
    throw new Error("Result request has not started");
  };
  let reject: (error: Error) => void = () => {
    throw new Error("Result request has not started");
  };
  const promise = new Promise<AgentToolCallResult | null>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("tool result lifetime", () => {
  it("retries a failed result when the detail is reopened", async () => {
    const store = createStore();
    const fetch = vi
      .spyOn(desktopApi, "getToolCallResult")
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValue(result);
    const release = store.set(observeToolCallResultAtom, subscription);
    await vi.waitFor(() =>
      expect(store.get(toolCallResultCacheAtom)["tool-1"]).toEqual({
        status: "error",
        message: "Offline",
      }),
    );
    expect(fetch).toHaveBeenCalledOnce();
    release();
    const releaseAgain = store.set(observeToolCallResultAtom, subscription);
    await vi.waitFor(() =>
      expect(store.get(toolCallResultCacheAtom)["tool-1"]).toEqual({
        status: "loaded",
        value: result,
      }),
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    releaseAgain();
  });

  it("ignores a request failure after a live result has arrived", async () => {
    const store = createStore();
    const pending = pendingResult();
    vi.spyOn(desktopApi, "getToolCallResult").mockReturnValue(pending.promise);
    const release = store.set(observeToolCallResultAtom, subscription);
    store.set(applyToolEventAtom, {
      type: "tool.finished",
      sessionId: "session-1",
      toolCall: toolCall(),
    });
    pending.reject(new Error("Old request failed"));
    await pending.promise.catch(() => {});
    expect(store.get(toolCallResultCacheAtom)["tool-1"]?.status).toBe("loaded");
    release();
  });

  it("keeps results out of unopened live timeline records", () => {
    const store = createStore();
    const fetch = vi.spyOn(desktopApi, "getToolCallResult");
    store.set(applyToolEventAtom, {
      type: "tool.finished",
      sessionId: "session-1",
      toolCall: toolCall(),
    });
    const summary = store.get(toolCallsBySessionAtom)["session-1"][0];
    expect(summary.content).toBeUndefined();
    expect(summary.rawOutput).toBeUndefined();
    expect(store.get(toolCallResultCacheAtom)).toEqual({});
    expect(fetch).not.toHaveBeenCalled();
  });

  it("normalizes bootstrap and history records to summaries", () => {
    const store = createStore();
    store.set(bootstrapToolCallsAtom, [toolCall()]);
    expect(
      store.get(toolCallsBySessionAtom)["session-1"][0].content,
    ).toBeUndefined();
    store.set(loadSessionToolCallsAtom, {
      sessionId: "session-1",
      toolCalls: [toolCall({ id: "tool-2" })],
    });
    for (const summary of store.get(toolCallsBySessionAtom)["session-1"]) {
      expect(summary.content).toBeUndefined();
      expect(summary.rawOutput).toBeUndefined();
    }
  });

  it("shares a request across panels and releases after the last consumer", async () => {
    const store = createStore();
    const fetch = vi
      .spyOn(desktopApi, "getToolCallResult")
      .mockResolvedValue(result);
    const releaseFirst = store.set(observeToolCallResultAtom, subscription);
    const releaseSecond = store.set(observeToolCallResultAtom, subscription);
    await vi.waitFor(() =>
      expect(store.get(toolCallResultCacheAtom)["tool-1"]).toEqual({
        status: "loaded",
        value: result,
      }),
    );
    expect(fetch).toHaveBeenCalledOnce();
    releaseFirst();
    releaseFirst();
    expect(store.get(toolCallResultCacheAtom)["tool-1"]).toBeDefined();
    releaseSecond();
    expect(store.get(toolCallResultCacheAtom)).toEqual({});
  });

  it("keeps a live result when an older request or event arrives later", async () => {
    const store = createStore();
    const pending = pendingResult();
    vi.spyOn(desktopApi, "getToolCallResult").mockReturnValue(pending.promise);
    const release = store.set(observeToolCallResultAtom, subscription);
    const latest = toolCall({ updatedAt: "2026-09-09T00:00:02.000Z" });
    store.set(applyToolEventAtom, {
      type: "tool.finished",
      sessionId: "session-1",
      toolCall: latest,
    });
    store.set(applyToolEventAtom, {
      type: "tool.updated",
      sessionId: "session-1",
      toolCall: toolCall({ status: "in_progress", content: [] }),
    });
    pending.resolve(result);
    await pending.promise;
    expect(store.get(toolCallResultCacheAtom)["tool-1"]).toEqual({
      status: "loaded",
      value: { content: latest.content, rawOutput: latest.rawOutput },
    });
    release();
  });

  it("does not let a released request overwrite a reopened detail", async () => {
    const store = createStore();
    const first = pendingResult();
    const second = pendingResult();
    vi.spyOn(desktopApi, "getToolCallResult")
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    store.set(observeToolCallResultAtom, subscription)();
    const release = store.set(observeToolCallResultAtom, subscription);
    first.resolve(result);
    await first.promise;
    expect(store.get(toolCallResultCacheAtom)["tool-1"]).toEqual({
      status: "loading",
    });
    second.resolve(null);
    await second.promise;
    expect(store.get(toolCallResultCacheAtom)["tool-1"]).toEqual({
      status: "loaded",
      value: null,
    });
    release();
  });

  it("clears a session without resurrecting results from pending requests", async () => {
    const store = createStore();
    const pending = pendingResult();
    vi.spyOn(desktopApi, "getToolCallResult").mockReturnValue(pending.promise);
    store.set(loadSessionToolCallsAtom, {
      sessionId: "session-1",
      toolCalls: [toolCall()],
    });
    const release = store.set(observeToolCallResultAtom, subscription);
    const releaseOther = store.set(observeToolCallResultAtom, {
      toolCallId: "other",
      sessionId: "session-2",
    });
    store.set(clearToolCallsForSessionAtom, "session-1");
    pending.resolve(result);
    await pending.promise;
    expect(store.get(toolCallResultCacheAtom)["tool-1"]).toBeUndefined();
    expect(
      store.get(toolCallsLoadedBySessionAtom)["session-1"],
    ).toBeUndefined();
    expect(store.get(toolCallResultCacheAtom).other).toEqual({
      status: "loaded",
      value: result,
    });
    release();
    releaseOther();
  });

  it("refreshes an open result when history supplies a newer tool state", async () => {
    const store = createStore();
    const fetch = vi
      .spyOn(desktopApi, "getToolCallResult")
      .mockResolvedValue(result);
    store.set(loadSessionToolCallsAtom, {
      sessionId: "session-1",
      toolCalls: [toolCall()],
    });
    const release = store.set(observeToolCallResultAtom, subscription);
    await vi.waitFor(() =>
      expect(store.get(toolCallResultCacheAtom)["tool-1"]?.status).toBe(
        "loaded",
      ),
    );
    store.set(loadSessionToolCallsAtom, {
      sessionId: "session-1",
      toolCalls: [toolCall({ updatedAt: "2026-09-09T00:00:03.000Z" })],
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    release();
  });
});
