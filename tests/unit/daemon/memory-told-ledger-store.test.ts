import { ToldLedgerStore } from "@cocurdex/daemon/internal/memory/told-ledger-store";
import type {
  MemoryEntry,
  MessageRecord,
  SessionRecord,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

const SESSION = { id: "home", sessionKind: "personal" } as SessionRecord;

function message(id: string, role: "user" | "assistant", content: string) {
  return {
    id,
    sessionId: SESSION.id,
    role,
    content,
    attachments: [],
    createdAt: "2026-11-15T00:00:00.000Z",
  } as MessageRecord;
}

function createHarness() {
  const settings = new Map<string, string>();
  const entries = new Map<string, MemoryEntry>();
  const messages: MessageRecord[] = [];
  const transcripts: string[] = [];
  let nextId = 1;
  let reply: (items: readonly string[]) => string[] = (items) => [...items];
  const store = new ToldLedgerStore({
    memory: {
      providerId: () => "rsrs",
      isReadyForTurns: () => true,
      show: async (id) => entries.get(id) ?? null,
      rememberIn: async (input) => {
        const id = `m${nextId++}`;
        entries.set(id, {
          id,
          title: input.title,
          content: input.content,
        } as MemoryEntry);
        return {
          action: "created",
          id,
          title: input.title,
          candidates: [],
          message: null,
        };
      },
      update: async (input) => {
        const entry = entries.get(input.id);
        if (!entry) throw new Error("missing");
        entries.set(input.id, { ...entry, content: input.content ?? "" });
        return entries.get(input.id) ?? null;
      },
      forget: async (id) => {
        entries.delete(id);
      },
      summarizeTold: async (_session, items, transcript) => {
        transcripts.push(transcript);
        return reply(items);
      },
    },
    getAppSetting: async (key) => settings.get(key) ?? null,
    setAppSetting: async (key, value) => {
      settings.set(key, value);
    },
    getSession: async () => SESSION,
    listMessages: async () => messages,
    personaName: async () => "Ada",
    announceChanged: () => {},
  });
  return {
    store,
    entries,
    messages,
    transcripts,
    reply: (next: typeof reply) => {
      reply = next;
    },
  };
}

describe("told ledger store", () => {
  it("folds only the messages since the last curation into the stored list", async () => {
    const h = createHarness();
    h.messages.push(
      message("u1", "user", "When is the release?"),
      message("a1", "assistant", "Release is Friday."),
    );
    h.reply((items) => [...items, "Release is on Friday"]);
    expect(await h.store.curate("p1", SESSION.id)).toBe(true);

    h.messages.push(
      message("u2", "user", "Moved?"),
      message("a2", "assistant", "Yes, Monday now."),
    );
    h.reply(() => ["Release moved to Monday"]);
    expect(await h.store.curate("p1", SESSION.id)).toBe(true);

    expect(h.transcripts[1]).not.toContain("Release is Friday.");
    expect(h.transcripts[1]).toContain("Monday now");
    expect(await h.store.items("p1")).toEqual(["Release moved to Monday"]);
    expect(h.entries.size).toBe(1);
    expect(await h.store.brief("p1")).toContain("- Release moved to Monday");

    expect(await h.store.curate("p1", SESSION.id)).toBe(false);
  });

  it("forgets one item, recreates a record the user deleted, and clears on persona delete", async () => {
    const h = createHarness();
    h.messages.push(message("a1", "assistant", "Two facts."));
    h.reply(() => ["Fact one", "Fact two"]);
    await h.store.curate("p1", SESSION.id);

    expect(await h.store.forgetItem("p1", "fact one")).toEqual(["Fact two"]);
    expect(await h.store.items("p1")).toEqual(["Fact two"]);

    h.entries.clear();
    expect(await h.store.items("p1")).toEqual([]);
    h.messages.push(message("a2", "assistant", "Fact three."));
    h.reply((items) => [...items, "Fact three"]);
    await h.store.curate("p1", SESSION.id);
    expect(await h.store.items("p1")).toEqual(["Fact three"]);

    await h.store.clear("p1");
    expect(h.entries.size).toBe(0);
    expect(await h.store.items("p1")).toEqual([]);
  });
});
