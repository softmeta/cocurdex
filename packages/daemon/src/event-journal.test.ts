import type { CocurdexDaemonEvent } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { createDaemonEventJournal } from "./event-journal";

function event(name: string): CocurdexDaemonEvent {
  return {
    type: "data.changed",
    scope: name,
  } as unknown as CocurdexDaemonEvent;
}

describe("createDaemonEventJournal", () => {
  it("assigns increasing sequence numbers", () => {
    const journal = createDaemonEventJournal();

    expect(journal.record(event("a")).seq).toBe(1);
    expect(journal.record(event("b")).seq).toBe(2);
  });

  it("replays only entries after the requested sequence", () => {
    const journal = createDaemonEventJournal();
    journal.record(event("a"));
    journal.record(event("b"));
    journal.record(event("c"));

    expect(journal.entriesAfter(1).map((entry) => entry.seq)).toEqual([2, 3]);
    expect(journal.entriesAfter(undefined)).toEqual([]);
  });

  it("evicts the oldest entries beyond capacity", () => {
    const journal = createDaemonEventJournal(2);
    journal.record(event("a"));
    journal.record(event("b"));
    journal.record(event("c"));

    expect(journal.entriesAfter(0).map((entry) => entry.seq)).toEqual([2, 3]);
  });
});
