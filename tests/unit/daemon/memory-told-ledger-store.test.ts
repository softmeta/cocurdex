import { ToldLedgerStore } from "@cocurdex/daemon/internal/memory/told-ledger-store";
import type {
  MemoryEntry,
  MessageRecord,
  SessionRecord,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

const SESSION = { id: "home", sessionKind: "personal" } as SessionRecord;
const LEDGER_KEY = "memory.toldLedgers";

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
  let showFails = false;
  let reply: (items: readonly string[]) => string[] = (items) => [...items];
  const store = new ToldLedgerStore({
    memory: {
      providerId: () => "builtin",
      isReadyForTurns: () => true,
      show: async (id) => {
        if (showFails) throw new Error("memory unavailable");
        return entries.get(id) ?? null;
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
  });
  return {
    store,
    settings,
    entries,
    messages,
    transcripts,
    reply: (next: typeof reply) => {
      reply = next;
    },
    failShow: (fails: boolean) => {
      showFails = fails;
    },
  };
}

describe("told ledger store", () => {
  it("folds only the messages since the last curation, outside the memory store", async () => {
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
    expect(h.entries.size).toBe(0);
    expect(await h.store.brief("p1")).toContain("- Release moved to Monday");

    expect(await h.store.curate("p1", SESSION.id)).toBe(false);
  });

  it("forgets one item and clears on persona delete", async () => {
    const h = createHarness();
    h.messages.push(message("a1", "assistant", "Two facts."));
    h.reply(() => ["Fact one", "Fact two"]);
    await h.store.curate("p1", SESSION.id);

    expect(await h.store.forgetItem("p1", "fact one")).toEqual(["Fact two"]);
    expect(await h.store.items("p1")).toEqual(["Fact two"]);

    await h.store.clear("p1");
    expect(await h.store.items("p1")).toEqual([]);
  });

  it("moves a ledger kept as a memory record into settings and deletes the record", async () => {
    const h = createHarness();
    h.entries.set("m1", {
      id: "m1",
      title: "What Ada already told the user",
      content:
        "Conclusions, facts and answers this assistant already gave the user.\r\n- Flight lands at 18:05\r\n- Dentist is on Friday",
    } as MemoryEntry);
    h.entries.set("m2", {
      id: "m2",
      title: "What Bo already told the user",
      content: "- Gym moved to 7:00",
    } as MemoryEntry);
    h.settings.set(
      LEDGER_KEY,
      JSON.stringify({
        p1: { provider: "builtin", memoryId: "m1", cursors: { home: "a1" } },
        p2: { provider: "builtin", memoryId: "m2", cursors: {} },
      }),
    );

    h.failShow(true);
    expect(await h.store.items("p1")).toEqual([]);
    expect(h.entries.has("m1")).toBe(true);

    h.failShow(false);
    expect(await h.store.items("p1")).toEqual([
      "Flight lands at 18:05",
      "Dentist is on Friday",
    ]);
    expect(h.entries.has("m1")).toBe(false);
    expect(h.settings.get(LEDGER_KEY)).not.toContain("m1");
    await h.store.migrateLegacy();
    expect(h.entries.size).toBe(0);
    expect(await h.store.items("p2")).toEqual(["Gym moved to 7:00"]);

    h.messages.push(
      message("a1", "assistant", "Flight lands at 18:05."),
      message("a2", "assistant", "Dentist moved to Monday."),
    );
    h.reply((items) => [items[0], "Dentist moved to Monday"]);
    await h.store.curate("p1", SESSION.id);
    expect(h.transcripts[0]).not.toContain("18:05");
    expect(await h.store.items("p1")).toEqual([
      "Flight lands at 18:05",
      "Dentist moved to Monday",
    ]);
  });
});
