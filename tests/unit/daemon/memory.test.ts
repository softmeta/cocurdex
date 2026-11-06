import { AgentToolBridge } from "@cocurdex/daemon/internal/agent-tools/agent-tool-bridge";
import { registerMemoryTools } from "@cocurdex/daemon/internal/agent-tools/groups/memory";
import { AgentToolRegistry } from "@cocurdex/daemon/internal/agent-tools/tool-registry";
import {
  buildAgentMemoryPolicy,
  buildGateNudge,
  buildMemoryBrief,
} from "@cocurdex/daemon/internal/memory/digest";
import {
  parseRecallPayload,
  parseRememberPayload,
  parseRsrsJson,
  parseShowPayload,
} from "@cocurdex/daemon/internal/memory/rsrs";
import {
  buildMemoryRecallQuery,
  DEFAULT_MEMORY_SETTINGS,
  gateMemorySettings,
  type MemoryRememberResult,
  memoryPlatformSupportsRsrs,
  normalizeMemorySettings,
  parseMemorySettings,
  redactMemorySecrets,
} from "@cocurdex/shared";
import { describe, expect, it, vi } from "vitest";

const caller = {
  sessionId: "session-1",
  sessionKind: "main" as const,
  workspaceId: "workspace-1",
  teamId: null,
};

function registryWith(enabled: boolean) {
  const registry = new AgentToolRegistry();
  const deps = {
    isEnabled: () => enabled,
    recall: vi.fn(async () => ({
      query: "q",
      items: [
        {
          id: "memory-1",
          title: "A memory",
          score: 0.9,
          importance: "important" as const,
          updatedAt: null,
        },
      ],
      truncated: false,
      error: null,
    })),
    show: vi.fn(async () => null),
    remember: vi.fn(
      async (): Promise<MemoryRememberResult> => ({
        action: "created" as const,
        id: "memory-2",
        title: "New",
        candidates: [],
        message: null,
      }),
    ),
    policy: vi.fn(async () => "policy text"),
    noteToolUse: vi.fn(),
  };
  registerMemoryTools(registry, deps);
  return { registry, deps };
}

describe("memory settings", () => {
  it("defaults to enabled when the setting is absent", () => {
    expect(parseMemorySettings(null)).toEqual(DEFAULT_MEMORY_SETTINGS);
    expect(DEFAULT_MEMORY_SETTINGS.enabled).toBe(true);
  });

  it("turns memory off where the rsrs CLI has no build", () => {
    expect(memoryPlatformSupportsRsrs({ os: "darwin", arch: "x64" })).toBe(
      false,
    );
    expect(memoryPlatformSupportsRsrs({ os: "darwin", arch: "arm64" })).toBe(
      true,
    );
    expect(memoryPlatformSupportsRsrs({ os: "win32", arch: "x64" })).toBe(true);
    expect(
      gateMemorySettings(DEFAULT_MEMORY_SETTINGS, {
        os: "darwin",
        arch: "x64",
      }).enabled,
    ).toBe(false);
    expect(
      gateMemorySettings(
        { ...DEFAULT_MEMORY_SETTINGS, enabled: false },
        { os: "linux", arch: "x64" },
      ).enabled,
    ).toBe(false);
  });

  it("keeps valid values and falls back for invalid ones", () => {
    const settings = normalizeMemorySettings({
      enabled: false,
      agent: { tools: false },
      chat: { saveOnEnd: false, saveTurns: "nope" },
      cliPath: "  /opt/rsrs  ",
    });
    expect(settings.enabled).toBe(false);
    expect(settings.agent.tools).toBe(false);
    expect(settings.agent.injectContext).toBe(true);
    expect(settings.chat.saveOnEnd).toBe(false);
    expect(settings.chat.saveTurns).toBe(true);
    expect(settings.cliPath).toBe("/opt/rsrs");
  });
});

describe("memory secret redaction", () => {
  it("removes common credentials before automatic capture", () => {
    const text = [
      "key sk-abcdefghijklmnopqrstuvwx",
      "token ghp_abcdefghijklmnopqrstuvwx",
      "aws AKIAABCDEFGHIJKLMNOP",
      "-----BEGIN PRIVATE KEY-----",
      "secret",
      "-----END PRIVATE KEY-----",
    ].join("\n");
    const redacted = redactMemorySecrets(text);
    expect(redacted).not.toContain("sk-abc");
    expect(redacted).not.toContain("ghp_abc");
    expect(redacted).not.toContain("AKIA");
    expect(redacted).not.toContain("secret");
    expect(redacted.match(/\[redacted\]/g)?.length).toBe(4);
  });
});

describe("memory recall query", () => {
  it("combines project, title, and message and caps the query", () => {
    expect(
      buildMemoryRecallQuery({
        project: "cocurdex",
        title: "Memory",
        message: "how does it work",
      }),
    ).toBe("cocurdex Memory how does it work");
    expect(
      buildMemoryRecallQuery({
        project: null,
        title: null,
        message: "x".repeat(5_000),
      }),
    ).toHaveLength(4_000);
  });
});

describe("rsrs JSON parsing", () => {
  it("parses recall details with scores and importance", () => {
    const items = parseRecallPayload({
      details: [
        {
          id: "abc",
          title: "Title",
          score: 0.5,
          importance: "trivial",
          updatedAt: "2026-10-28T00:00:00.000Z",
        },
      ],
    });
    expect(items).toEqual([
      {
        id: "abc",
        title: "Title",
        score: 0.5,
        importance: "trivial",
        updatedAt: "2026-10-28T00:00:00.000Z",
      },
    ]);
  });

  it("reads a recall without hits as empty, not as its status row", () => {
    expect(
      parseRecallPayload({
        command: "recall",
        status: "skip",
        items: [{ name: "results", status: "skip", value: "0" }],
        details: null,
      }),
    ).toEqual([]);
  });

  it("parses a shown entry", () => {
    expect(
      parseShowPayload({
        details: {
          entry: {
            id: "abc",
            title: "Title",
            content: "Body",
            importance: "important",
            parent_id: "parent",
            tags: ["a"],
          },
        },
      }),
    ).toMatchObject({
      id: "abc",
      title: "Title",
      content: "Body",
      importance: "important",
      parentId: "parent",
      tags: ["a"],
    });
  });

  it("recognizes created, candidate, and skipped remember results", () => {
    expect(
      parseRememberPayload({ summary: { action: "created", id: "id-1" } }),
    ).toMatchObject({ action: "created", id: "id-1" });
    expect(
      parseRememberPayload({
        summary: { action: "candidates" },
        details: [{ id: "old", title: "Old", score: 0.9 }],
      }),
    ).toMatchObject({ action: "candidates", id: null });
    expect(parseRememberPayload({ summary: {} })).toMatchObject({
      action: "skipped",
      id: null,
    });
  });

  it("preserves real rsrs pending candidates without treating them as recall rows", () => {
    expect(
      parseRememberPayload({
        status: "pending",
        summary: { state: "candidates", written: false, merge_count: 1 },
        items: [
          {
            name: "1234abcd",
            status: "pending",
            value: "similarity=90% title=Prefers tea",
          },
        ],
        details: null,
        actions: ["Read candidate bodies before choosing merge or attach."],
      }),
    ).toMatchObject({
      action: "candidates",
      id: null,
      candidates: [{ id: "1234abcd", title: "Prefers tea", score: 0.9 }],
      message: expect.stringContaining("Read candidate bodies"),
    });
  });

  it("parses JSON with a leading progress line", () => {
    expect(
      parseRsrsJson('loading\n{"command":"list","status":"ok"}'),
    ).toMatchObject({ command: "list", status: "ok" });
  });
});

describe("memory agent tools", () => {
  it("does not count pending or skipped writes as saved", async () => {
    const { registry, deps } = registryWith(true);
    deps.remember.mockResolvedValue({
      action: "candidates",
      id: null,
      title: null,
      candidates: [],
      message: "Pending",
    });
    await registry.call(caller, "memory_remember", {
      title: "Tea",
      content: "Likes tea",
    });
    expect(deps.noteToolUse).not.toHaveBeenCalledWith(
      caller.sessionId,
      "remember",
    );
  });
  it("exposes reads and writes to a main session when enabled", () => {
    const { registry } = registryWith(true);
    const names = registry.catalog(caller).tools.map((tool) => tool.name);
    expect(names).toEqual(["recall", "show", "remember", "policy"]);
  });

  it("does not expose memory tools to subagents", () => {
    const { registry } = registryWith(true);
    const names = registry
      .catalog({ ...caller, sessionKind: "subagent" })
      .tools.map((tool) => tool.name);
    expect(names).toEqual([]);
  });

  it("exposes nothing when memory is disabled", () => {
    const { registry } = registryWith(false);
    expect(registry.catalog(caller).tools).toEqual([]);
  });

  it("forwards a recall call to the memory service", async () => {
    const { registry, deps } = registryWith(true);
    const result = await registry.call(caller, "memory_recall", {
      query: "cocurdex",
      limit: 3,
    });
    expect(deps.recall).toHaveBeenCalledWith(
      { query: "cocurdex", limit: 3 },
      expect.objectContaining({ sessionId: "session-1" }),
    );
    expect(result).toMatchObject({ items: [{ id: "memory-1" }] });
  });

  it("reports tool use with the caller session so gates can be checked", async () => {
    const { registry, deps } = registryWith(true);
    await registry.call(caller, "memory_recall", { query: "cocurdex" });
    await registry.call(caller, "memory_remember", {
      content: "content",
      title: "title",
    });
    expect(deps.noteToolUse).toHaveBeenCalledWith("session-1", "recall");
    expect(deps.noteToolUse).toHaveBeenCalledWith("session-1", "remember");
  });

  it("injects memory tools and policy through the agent tool bridge", async () => {
    const session = {
      id: "session-1",
      sessionKind: "main",
      workspaceId: "workspace-1",
    } as never;
    const bridge = new AgentToolBridge({
      url: "http://127.0.0.1:1/mcp",
      getSession: async () => session,
      memoryInstructions: (hasMemoryTools) =>
        hasMemoryTools ? "memory policy" : undefined,
    });
    const deps = {
      isEnabled: () => true,
      recall: async () => ({
        query: "",
        items: [],
        truncated: false,
        error: null,
      }),
      show: async () => null,
      remember: async () => ({
        action: "skipped" as const,
        id: null,
        title: null,
        candidates: [],
        message: null,
      }),
      policy: async () => "policy",
    };
    registerMemoryTools(bridge.registry, deps);
    const binding = bridge.bind({ id: "session-1" });
    if (!binding) throw new Error("expected a session binding");
    const catalog = await bridge.catalog(binding.binding.token);
    expect(catalog.tools.map((tool) => tool.name)).toContain("recall");
    expect(catalog.instructions ?? "").toContain("memory policy");
  });
});

describe("memory gates", () => {
  it("injects both gates into the agent policy", () => {
    const policy = buildAgentMemoryPolicy(true);
    expect(policy).toContain("Gate 1 - recall before acting.");
    expect(policy).toContain("Gate 2 - store before replying.");
    expect(policy).toContain("memory_recall");
    expect(policy).toContain("memory_remember");
    expect(policy).not.toContain("do not mention the memory machinery");
  });

  it("skips the gates when no memory tools are available", () => {
    const policy = buildAgentMemoryPolicy(false);
    expect(policy).not.toContain("Gate 1");
    expect(policy).toContain("the runtime handles recall and capture");
  });

  it("marks recall as satisfied and restates the store gate in the brief", () => {
    const brief = buildMemoryBrief(
      [
        {
          id: "memory-1",
          title: "A memory",
          score: 0.9,
          importance: "important" as const,
          updatedAt: null,
        },
      ],
      { hasTools: true },
    );
    expect(brief).toContain('gate="recall-satisfied"');
    expect(brief).toContain("Gate 2 (store) still applies");
    expect(brief).toContain("memory-1");
  });

  it("builds a nudge after a missed store gate", () => {
    const nudge = buildGateNudge();
    expect(nudge).toContain("Gate 2 (store) was missed");
    expect(nudge).toContain("memory_remember");
  });
});
