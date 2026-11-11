import type { AgentAdapter, AgentSession } from "@cocurdex/agent-core";
import { AgentRuntimeManager } from "@cocurdex/daemon/internal/runtime";
import {
  type ReclaimCandidate,
  selectRuntimesToReclaim,
} from "@cocurdex/daemon/internal/runtime-reclaim";
import type {
  AgentEvent,
  MessageRecord,
  SessionRecord,
} from "@cocurdex/shared";
import { describe, expect, it, vi } from "vitest";

const MINUTE = 60_000;
const POLICY = { idleMs: 30 * MINUTE, maxExternal: 2 };

function candidate(
  sessionId: string,
  idleMinutes: number,
  overrides: Partial<ReclaimCandidate> = {},
): ReclaimCandidate {
  return {
    sessionId,
    lastActiveAt: 100 * MINUTE - idleMinutes * MINUTE,
    busy: false,
    external: true,
    ...overrides,
  };
}

describe("selectRuntimesToReclaim", () => {
  const now = 100 * MINUTE;

  it("reclaims external runtimes idle past the limit", () => {
    expect(
      selectRuntimesToReclaim(
        [candidate("old", 31), candidate("fresh", 5)],
        now,
        POLICY,
      ),
    ).toEqual(["old"]);
  });

  it("never reclaims busy or in-process runtimes", () => {
    expect(
      selectRuntimesToReclaim(
        [
          candidate("waiting", 90, { busy: true }),
          candidate("pi", 90, { external: false }),
        ],
        now,
        POLICY,
      ),
    ).toEqual([]);
  });

  it("evicts the least recently used idle runtimes over the cap", () => {
    expect(
      selectRuntimesToReclaim(
        [
          candidate("a", 3),
          candidate("b", 1),
          candidate("c", 4),
          candidate("d", 2, { busy: true }),
          candidate("pi", 9, { external: false }),
        ],
        now,
        POLICY,
      ),
    ).toEqual(["c", "a"]);
  });
});

function sessionRecord(id: string, agentType: SessionRecord["agentType"]) {
  return {
    id,
    workspaceId: "workspace-1",
    parentSessionId: null,
    agentType,
    title: "Test",
    status: "idle",
    writeMode: "read-only",
    sessionModeId: null,
    createdAt: "2026-11-11T00:00:00.000Z",
    lastMessageAt: null,
    updatedAt: "2026-11-11T00:00:00.000Z",
  } satisfies SessionRecord;
}

function stubRuntime(): AgentSession {
  return {
    dispose: vi.fn(),
    stop: vi.fn(),
    sendMessage: vi.fn(
      async (): Promise<MessageRecord> => ({
        id: "reply",
        sessionId: "session",
        role: "assistant",
        content: "ok",
        attachments: [],
        createdAt: "2026-11-11T00:00:01.000Z",
      }),
    ),
  };
}

describe("AgentRuntimeManager idle reclaim", () => {
  it("releases an idle external runtime and recreates it on the next turn", async () => {
    let now = 0;
    const events: AgentEvent[] = [];
    const created: Array<{ agentType: string; runtime: AgentSession }> = [];
    const manager = new AgentRuntimeManager({
      broadcastAgentEvent: (event) => events.push(event),
      reclaim: { intervalMs: 3_600_000, now: () => now },
      createAdapter: (agentType): AgentAdapter => ({
        getDescriptor() {
          throw new Error("unused");
        },
        ...(agentType === "pi" ? { runsInProcess: true } : {}),
        createSession() {
          const runtime = stubRuntime();
          created.push({ agentType, runtime });
          return runtime;
        },
      }),
    });
    const persistence = { providerSession: null, onProviderSessionUpdate() {} };
    const codex = sessionRecord("codex-session", "codex");
    const pi = sessionRecord("pi-session", "pi");
    try {
      for (const session of [codex, pi]) {
        await manager.sendSessionMessage(
          { session, workspaceRootPath: "/workspace", content: "hi" },
          { ...persistence, history: [] },
        );
      }

      now = 31 * MINUTE;
      await manager.reclaimIdleRuntimes();
      await manager.flushEvents();

      const [codexRuntime, piRuntime] = created.map((entry) => entry.runtime);
      expect(codexRuntime.dispose).toHaveBeenCalledOnce();
      expect(piRuntime.dispose).not.toHaveBeenCalled();
      expect(manager.getAgentSession(codex.id)).toBeNull();
      expect(events).toContainEqual({
        type: "session.runtime.released",
        sessionId: codex.id,
      });

      await manager.sendSessionMessage(
        { session: codex, workspaceRootPath: "/workspace", content: "again" },
        { ...persistence, history: [] },
      );
      expect(
        created.filter((entry) => entry.agentType === "codex"),
      ).toHaveLength(2);
    } finally {
      await manager.shutdown();
    }
  });
});
