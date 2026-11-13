import { AgentToolBridge } from "@cocurdex/daemon/internal/agent-tools/agent-tool-bridge";
import { registerMemoryTools } from "@cocurdex/daemon/internal/agent-tools/groups/memory";
import type { MemoryProvider } from "@cocurdex/daemon/internal/memory/provider";
import { MemoryService } from "@cocurdex/daemon/internal/memory/service";
import { parseMemoryCaptures } from "@cocurdex/daemon/internal/memory/settings";
import {
  type CocurdexDaemonEvent,
  type MemoryEntry,
  type MemoryHistoryEntry,
  type MemoryRecallItem,
  type MemoryRememberInput,
  type MemoryRememberResult,
  type MemorySettings,
  memoryPartitionOf,
  memoryPartitionProject,
  type SessionRecord,
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
  recalled: string[] = [];
  remembered: string[] = [];

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
  async injectedAgents() {
    return [];
  }
  async recall(input: { query: string }) {
    this.recalled.push(input.query);
    const items: MemoryRecallItem[] = [...this.live.values()].map((item) => ({
      id: item.id,
      title: item.title,
      score: 0.9,
      importance: item.importance,
      updatedAt: null,
    }));
    return { items, error: null };
  }
  async show(id: string) {
    return { entry: this.live.get(id) ?? null, error: null };
  }
  async list(input: { limit: number; project: string | null }) {
    return [...this.live.values()]
      .filter((item) => !input.project || item.project === input.project)
      .slice(0, input.limit);
  }
  async remember(input: MemoryRememberInput): Promise<MemoryRememberResult> {
    const id = `m${this.live.size + 1}`;
    this.live.set(id, { ...entry(id, null), ...input });
    this.remembered.push(input.title);
    return {
      action: "created" as const,
      id,
      title: input.title,
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

function agentSession(): SessionRecord {
  const now = "2026-11-05T10:00:00.000Z";
  return {
    id: "personal-1",
    workspaceId: "personal",
    title: "Assistant",
    agentType: "pi",
    sessionKind: "personal",
    status: "idle",
    writeMode: "read-only",
    sessionModeId: null,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
    archivedAt: null,
    providerSnapshot: null,
    worktreePath: null,
    peerInbound: "refuse",
  } as SessionRecord;
}

function createService(settings: MemorySettings = ENABLED) {
  const provider = new InMemoryProvider();
  const events: CocurdexDaemonEvent[] = [];
  const values = new Map<string, string>([
    ["memory", JSON.stringify(settings)],
  ]);
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
  return { service, provider, events, values };
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
  it("refuses scoped recall when partition support is unavailable", async () => {
    const { service, provider } = createService();
    const capabilities = await provider.capabilities();
    provider.capabilities = async () => ({
      ...capabilities,
      partitions: false,
    });
    const result = await service.recallIn({ query: "private" }, [
      { kind: "me" },
    ]);
    expect(result.error).toContain("partition");
    expect(provider.recalled).toEqual([]);
  });

  it("refuses reading or merging a memory outside the writable partition", async () => {
    const { service, provider } = createService();
    provider.live.set("foreign", entry("foreign", "cocurdex/agent/other"));
    await expect(service.showIn("foreign", [{ kind: "me" }])).rejects.toThrow(
      "partition",
    );
    await expect(
      service.rememberIn(
        {
          title: "Combined",
          content: "Combined facts",
          mergeIds: ["foreign"],
        },
        { kind: "me" },
      ),
    ).rejects.toThrow("partition");
    expect(provider.remembered).toEqual([]);
    expect(provider.live.has("foreign")).toBe(true);
  });

  it("stores a partition write whose only similar memories live in other partitions", async () => {
    const { service, provider } = createService();
    provider.live.set("foreign", entry("foreign", "cocurdex/agent/other"));
    const store = provider.remember.bind(provider);
    provider.remember = async (input: MemoryRememberInput) =>
      input.force
        ? store(input)
        : {
            action: "candidates" as const,
            id: null,
            title: null,
            candidates: [
              {
                id: "foreign",
                title: "Title foreign",
                score: 0.9,
                importance: "important" as const,
                updatedAt: null,
              },
            ],
            message: null,
          };

    const result = await service.rememberIn(
      {
        title: "Calls me Heisenberg",
        content: "Address the user as Heisenberg",
      },
      { kind: "agent", agentId: "coach" },
    );

    expect(result.action).toBe("created");
    expect(provider.remembered).toEqual(["Calls me Heisenberg"]);
    expect(provider.live.get("foreign")?.title).toBe("Title foreign");
  });

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

  it("injects recalled memories into an agent turn", async () => {
    const { service, provider } = await createService();
    provider.live.set("a", entry("a", null));

    const context = await service.buildTurnContext(
      agentSession(),
      "What should I cook tonight?",
      "agent",
    );
    expect(provider.recalled).toHaveLength(1);
    expect(context?.items.map((item) => item.id)).toEqual(["a"]);
    expect(context?.brief).toContain("Title a");
  });

  it("serves the agent memory tools from the provider", async () => {
    const { service, provider } = await createService();
    const session = agentSession();
    const bridge = new AgentToolBridge({
      url: "http://127.0.0.1:1/mcp",
      getSession: async () => session as never,
      memoryInstructions: (hasMemoryTools) =>
        hasMemoryTools ? service.agentInstructions(true) : undefined,
    });
    registerMemoryTools(bridge.registry, {
      isEnabled: () => service.areToolsEnabledSync(),
      recall: (input) => service.recall(input),
      show: (id) => service.show(id),
      remember: (input) => service.remember(input),
      policy: () => service.policy(),
    });
    const binding = bridge.bind({ id: session.id });
    if (!binding) throw new Error("expected a session binding");
    const catalog = await bridge.catalog(binding.binding.token);
    expect(catalog.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["recall", "show", "remember"]),
    );

    const stored = await service.remember({
      title: "Likes ramen",
      content: "The user likes ramen",
    });
    expect(stored).toMatchObject({ action: "created" });
    expect(provider.remembered).toEqual(["Likes ramen"]);
    const shown = await service.show(stored.id ?? "");
    expect(shown?.content).toBe("The user likes ramen");
  });

  it("reads captures saved before providers existed as rsrs", async () => {
    expect(
      parseMemoryCaptures(
        JSON.stringify({
          old: { memoryId: "x", savedAt: "2026-10-01T00:00:00Z", kind: "turn" },
        }),
      ).old?.provider,
    ).toBe("rsrs");
  });
});
