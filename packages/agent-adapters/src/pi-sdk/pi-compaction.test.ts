import {
  type AgentEvent,
  type AgentToolCallRecord,
  readContextCompactionDetails,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { createContextCompactionTracker } from "../shared/context-compaction-tracker";
import { handlePiCompactionEvent } from "./pi-compaction";

function setup() {
  const events: AgentEvent[] = [];
  const compaction = createContextCompactionTracker({
    sessionId: "session-1",
    emit: (event) => events.push(event),
  });
  const finished = () =>
    events.flatMap((event): AgentToolCallRecord[] =>
      event.type === "tool.finished" ? [event.toolCall] : [],
    );
  return { compaction, events, finished };
}

describe("handlePiCompactionEvent", () => {
  it("records threshold compaction as automatic with its token estimate", () => {
    const { compaction, events, finished } = setup();

    handlePiCompactionEvent(compaction, {
      type: "compaction_start",
      reason: "threshold",
    });
    handlePiCompactionEvent(compaction, {
      type: "compaction_end",
      reason: "threshold",
      result: { tokensBefore: 120_000, estimatedTokensAfter: 9_000 },
      aborted: false,
      willRetry: false,
    });

    expect(events[0]).toMatchObject({
      type: "tool.started",
      toolCall: { status: "in_progress" },
    });
    expect(finished()[0]?.status).toBe("completed");
    expect(
      readContextCompactionDetails({ rawInput: finished()[0]?.rawInput }),
    ).toEqual({
      trigger: "auto",
      tokensBefore: 120_000,
      tokensAfter: 9_000,
      error: null,
    });
  });

  it("fails aborted compaction", () => {
    const { compaction, finished } = setup();

    handlePiCompactionEvent(compaction, {
      type: "compaction_start",
      reason: "manual",
    });
    handlePiCompactionEvent(compaction, {
      type: "compaction_end",
      reason: "manual",
      result: undefined,
      aborted: true,
      willRetry: false,
      errorMessage: "Compaction cancelled",
    });

    expect(finished()[0]?.status).toBe("failed");
    expect(
      readContextCompactionDetails({ rawInput: finished()[0]?.rawInput }),
    ).toMatchObject({
      trigger: "manual",
      error: "Compaction cancelled",
    });
  });
});
