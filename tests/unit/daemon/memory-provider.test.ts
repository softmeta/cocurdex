import type { MemoryProvider } from "@cocurdex/daemon/internal/memory/provider";
import { MemoryService } from "@cocurdex/daemon/internal/memory/service";
import {
  type CocurdexDaemonEvent,
  type MemoryEntry,
  type MemoryHistoryEntry,
  type MemorySettings,
  memoryPartitionOf,
  memoryPartitionProject,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

const ENABLED: MemorySettings = {
  enabled: true,
  agent: { injectContext: true, tools: true },
  chat: { recall: true, saveTurns: true, saveOnEnd: true },
  cliPath: null,
};

function entry(id: string, project: string | null): MemoryEntry {
  return {
    id,
    title: `Title ${id}`,
    content: `Body ${id}`,
    importance: "important",
    kind: null,
    project,
    tags: [],
    parentId: null,
    createdAt: null,
    updatedAt: null,
    device: null,
  };
}

class InMemoryProvider implements MemoryProvider {
  readonly id = "in-memory";
  readonly live = new Map<string, MemoryEntry>();
  readonly deleted = new Map<string, MemoryEntry>();
  readonly log: MemoryHistoryEntry[] = [];
  calls = 0;

  private record(entryId: string, action: string) {
    this.log.unshift({
      entryId,
      action,
      title: null,
      excerpt: null,
      actor: null,
      at: null,
    });
  }

  async available() {
    this.calls += 1;
    return true;
  }
  async capabilities() {
    return {
      partitions: true,
      list: true,
      update: true,
      forget: true,
      restore: true,
      history: true,
      revision: true,
      export: false,
      import: false,
    };
  }
  async policy() {
    return "policy";
  }
  async recall() {
    return { items: [], error: null };
  }
  async show(id: string) {
    return { entry: this.live.get(id) ?? null, error: null };
  }
  async list(input: { limit: number; project: string | null }) {
    return [...this.live.values()]
      .filter((item) => !input.project || item.project === input.project)
      .slice(0, input.limit);
  }
  async remember() {
    return {
      action: "skipped" as const,
      id: null,
      title: null,
      candidates: [],
      message: null,
    };
  }
  async update(input: { id: string; title?: string; content?: string }) {
    const current = this.live.get(input.id);
    if (!current) throw new Error(`not found #${input.id}`);
    this.live.set(input.id, {
      ...current,
      title: input.title ?? current.title,
      content: input.content ?? current.content,
    });
    this.record(input.id, "update");
  }
  async forget(id: string) {
    const current = this.live.get(id);
    if (!current) throw new Error(`not found #${id}`);
    this.live.delete(id);
    this.deleted.set(id, current);
    this.record(id, "delete");
  }
  async restore(id: string) {
    const current = this.deleted.get(id);
    if (!current) throw new Error(`not found #${id}`);
    this.deleted.delete(id);
    this.live.set(id, current);
    this.record(id, "restore");
  }
  async history(input: { id: string | null; limit: number }) {
    return this.log
      .filter((row) => !input.id || row.entryId === input.id)
      .slice(0, input.limit);
  }
  async revision() {
    return String(this.log.length);
  }
  async exportTo() {}
  async importFrom() {
    return { imported: 0, duplicates: 0, skipped: 0 };
  }
}

function createService(settings: MemorySettings = ENABLED) {
  const provider = new InMemoryProvider();
  const events: CocurdexDaemonEvent[] = [];
  const values = new Map([["memory", JSON.stringify(settings)]]);
  const service = new MemoryService({
    userDataPath: "unused",
    state: {
      getAppSetting: async (key: string) => values.get(key) ?? null,
      setAppSetting: async (key: string, value: string) => {
        values.set(key, value);
      },
    } as never,
    broadcast: (event) => events.push(event),
    resolveSessionProvider: async () => null,
    platform: { os: "darwin", arch: "arm64" },
    startRuntime: false,
    provider,
  });
  return { service, provider, events };
}

describe("memory partitions", () => {
  it("round-trips the about-me and agent partitions through a project", () => {
    expect(memoryPartitionOf(memoryPartitionProject({ kind: "me" }))).toEqual({
      kind: "me",
    });
    expect(
      memoryPartitionOf(
        memoryPartitionProject({ kind: "agent", agentId: "coach" }),
      ),
    ).toEqual({ kind: "agent", agentId: "coach" });
    expect(memoryPartitionOf("acme-shop")).toBeNull();
    expect(memoryPartitionOf(null)).toBeNull();
  });
});

describe("MemoryService over a MemoryProvider", () => {
  it("lists one partition without entries from other partitions", async () => {
    const { service, provider } = await createService();
    const me = memoryPartitionProject({ kind: "me" });
    const coach = memoryPartitionProject({ kind: "agent", agentId: "coach" });
    provider.live.set("a", entry("a", me));
    provider.live.set("b", entry("b", coach));
    provider.live.set("c", entry("c", null));

    const mine = await service.list({ partition: { kind: "me" } });
    expect(mine.items.map((item) => item.id)).toEqual(["a"]);
    const all = await service.list();
    expect(all.items.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("forgets and restores an entry and announces each change", async () => {
    const { service, provider, events } = await createService();
    provider.live.set("a", entry("a", null));

    await service.forget("a");
    expect((await service.list()).items).toEqual([]);
    await service.restore("a");
    expect((await service.list()).items.map((item) => item.id)).toEqual(["a"]);

    const history = await service.history({ id: "a" });
    expect(history.map((row) => row.action)).toEqual(["restore", "delete"]);
    expect(
      events.filter(
        (event) =>
          event.type === "data.changed" && event.areas.includes("memory"),
      ),
    ).toHaveLength(2);
  });

  it("redacts secrets from an edit and returns the stored entry", async () => {
    const { service, provider } = await createService();
    provider.live.set("a", entry("a", null));

    const updated = await service.update({
      id: "a",
      content: "token sk-abcdefghijklmnopqrstuvwxyz0123",
    });
    expect(updated?.content).toBe("token [redacted]");
    await expect(service.update({ id: "a", title: "  " })).rejects.toThrow();
  });

  it("leaves the provider untouched while memory is off", async () => {
    const { service, provider } = await createService({
      ...ENABLED,
      enabled: false,
    });
    provider.live.set("a", entry("a", null));

    const result = await service.list();
    expect(result.items).toEqual([]);
    expect(result.error).not.toBeNull();
    await expect(service.forget("a")).rejects.toThrow();
    expect(provider.calls).toBe(0);
    expect(provider.live.has("a")).toBe(true);
  });
});
