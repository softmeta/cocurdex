import type { MessageRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  findMessageById,
  getFirstChangedMessageIndex,
  upsertMessages,
} from "./message-collection";

function message(id: string, content = id): MessageRecord {
  return {
    id,
    sessionId: "session",
    role: "assistant",
    content,
    attachments: [],
    createdAt: "2026-09-08T00:00:00Z",
  };
}

describe("message collection", () => {
  it("merges updates without changing older snapshots or timestamps", () => {
    const original = [message("history"), message("tail")];
    const updated = upsertMessages(original, [
      { ...message("tail", "answer"), createdAt: "2026-09-08T01:00:00Z" },
      message("new"),
    ]);

    expect(updated[0]).toBe(original[0]);
    expect(updated[1]).toEqual(message("tail", "answer"));
    expect(original).toEqual([message("history"), message("tail")]);
    expect(findMessageById(original, "new")).toBeUndefined();
    expect(findMessageById(updated, "new")).toEqual(message("new"));
  });

  it("deduplicates a loaded history while retaining first insertion order", () => {
    expect(
      upsertMessages([], [message("a"), message("b"), message("a", "new")]),
    ).toEqual([message("a", "new"), message("b")]);
  });

  it("finds changes correctly across consecutive and skipped snapshots", () => {
    const initial = upsertMessages([], [message("a"), message("b")]);
    const middle = upsertMessages(initial, [message("a", "changed")]);
    const latest = upsertMessages(middle, [message("b", "changed")]);

    expect(getFirstChangedMessageIndex(middle, latest)).toBe(1);
    expect(getFirstChangedMessageIndex(initial, latest)).toBe(0);
    expect(getFirstChangedMessageIndex(latest, latest)).toBe(2);
  });
});
