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

    expect(journal.entriesAfter(1).entries.map((entry) => entry.seq)).toEqual([
      2, 3,
    ]);
    expect(journal.entriesAfter(undefined).entries).toEqual([]);
  });

  it("evicts the oldest entries beyond capacity", () => {
    const journal = createDaemonEventJournal(2);
    journal.record(event("a"));
    journal.record(event("b"));
    journal.record(event("c"));

    const replay = journal.entriesAfter(0);
    expect(replay.entries.map((entry) => entry.seq)).toEqual([2, 3]);
    expect(replay.hasGap).toBe(true);
  });

  it("flags a gap when the position precedes the retained window", () => {
    const journal = createDaemonEventJournal(2);
    journal.record(event("a"));
    journal.record(event("b"));
    journal.record(event("c"));

    expect(journal.entriesAfter(0).hasGap).toBe(true);
    expect(journal.entriesAfter(1).hasGap).toBe(false);
    expect(journal.entriesAfter(2).hasGap).toBe(false);
    expect(journal.entriesAfter(3).hasGap).toBe(false);
  });

  it("flags a gap when the position is ahead of the journal", () => {
    const journal = createDaemonEventJournal();
    journal.record(event("a"));

    expect(journal.entriesAfter(5).hasGap).toBe(true);
  });
});
