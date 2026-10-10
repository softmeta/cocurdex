import { describe, expect, it } from "vitest";
import {
  createContextCompactionToolCall,
  finishContextCompactionToolCall,
  readContextCompactionDetails,
} from "./context-compaction";

const START = "2026-10-10T00:00:00.000Z";
const END = "2026-10-10T00:00:30.000Z";

describe("context compaction tool calls", () => {
  it("keeps the trigger and records token counts when compaction completes", () => {
    const started = createContextCompactionToolCall({
      id: "compact-1",
      sessionId: "session-1",
      trigger: "auto",
      at: START,
    });
    const finished = finishContextCompactionToolCall(started, {
      status: "completed",
      tokensBefore: 180_000.4,
      tokensAfter: 21_000,
      at: END,
    });

    expect(started.status).toBe("in_progress");
    expect(finished).toMatchObject({
      status: "completed",
      startedAt: START,
      updatedAt: END,
    });
    expect(readContextCompactionDetails(finished)).toEqual({
      trigger: "auto",
      tokensBefore: 180_000,
      tokensAfter: 21_000,
      error: null,
    });
  });

  it("keeps the failure reason readable from the persisted summary", () => {
    const started = createContextCompactionToolCall({
      id: "compact-1",
      sessionId: "session-1",
      at: START,
    });
    const failed = finishContextCompactionToolCall(started, {
      status: "failed",
      error: " prompt too long ",
      tokensAfter: 0,
      at: END,
    });

    expect(failed.status).toBe("failed");
    expect(readContextCompactionDetails({ rawInput: failed.rawInput })).toEqual(
      {
        trigger: null,
        tokensBefore: null,
        tokensAfter: null,
        error: "prompt too long",
      },
    );
  });

  it("reads malformed persisted details as unknown", () => {
    expect(
      readContextCompactionDetails({
        rawInput: { trigger: "sometimes", tokensBefore: "lots" },
      }),
    ).toEqual({
      trigger: null,
      tokensBefore: null,
      tokensAfter: null,
      error: null,
    });
    expect(readContextCompactionDetails({ rawInput: null }).trigger).toBeNull();
  });
});
