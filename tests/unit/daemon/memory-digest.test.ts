import { buildTranscriptForSummary } from "@cocurdex/daemon/internal/memory/digest";
import type { MessageRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

function message(role: "user" | "assistant", content: string, index: number) {
  return {
    id: `m-${index}`,
    sessionId: "chat-1",
    role,
    content,
    attachments: [],
    createdAt: new Date(Date.UTC(2026, 10, 28, 0, index)).toISOString(),
  } satisfies MessageRecord;
}

describe("buildTranscriptForSummary", () => {
  it("keeps the final exchange when earlier turns use up the budget", () => {
    const long = "stack trace line ".repeat(200);
    const messages = [
      message("user", `first attempt ${long}`, 0),
      message("assistant", `still failing ${long}`, 1),
      message("user", `second attempt ${long}`, 2),
      message("assistant", `still failing ${long}`, 3),
      message("user", "what fixed it?", 4),
      message("assistant", "Pin node 24.14; the cache key was wrong.", 5),
    ];
    const transcript = buildTranscriptForSummary(messages, { maxChars: 4_000 });
    expect(transcript.length).toBeLessThanOrEqual(4_000);
    expect(transcript).toContain("Pin node 24.14; the cache key was wrong.");
  });
});
