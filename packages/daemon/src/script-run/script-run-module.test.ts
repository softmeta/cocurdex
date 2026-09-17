import type { ScriptRunRepository } from "@cocurdex/db";
import type {
  MessageRecord,
  ScriptRunAgentRecord,
  ScriptRunChangedEvent,
  ScriptRunRecord,
  SendSessionCommand,
  SessionRecord,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import type { SessionTurnOutcome } from "../session-control";
import { ScriptRunModule } from "./script-run-module";

function session(overrides: Partial<SessionRecord>): SessionRecord {
  return {
    id: "lead",
    workspaceId: "w-1",
    title: "Lead",
    agentType: "codex",
    status: "idle",
    writeMode: "native-write",
    sessionModeId: null,
    permissionMode: "codex-auto",
    createdAt: "",
    updatedAt: "",
    lastMessageAt: null,
    ...overrides,
  };
}

function memoryRepository(): ScriptRunRepository {
  const runs = new Map<string, ScriptRunRecord>();
  const agents = new Map<string, ScriptRunAgentRecord>();
  return {
    async saveRun(run) {
      runs.set(run.id, { ...run });
    },
    async getRun(runId) {
      const run = runs.get(runId);
      if (!run) return null;
      return {
        run,
        agents: [...agents.values()].filter((agent) => agent.runId === runId),
      };
    },
    async listRuns(filter) {
      return [...runs.values()].filter(
        (run) =>
          !filter.requesterSessionId ||
          run.requesterSessionId === filter.requesterSessionId,
      );
    },
    async saveAgent(agent) {
      agents.set(agent.id, { ...agent });
    },
    async interruptRunning() {
      return [];
    },
  };
}

type Reply = (prompt: string) => string | "hang";

function harness(reply: Reply, settings: Record<string, unknown> = {}) {
  const sessions = new Map<string, SessionRecord>([
    ["lead", session({ id: "lead" })],
  ]);
  const sent: SendSessionCommand[] = [];
  const stopped: string[] = [];
  const events: ScriptRunChangedEvent[] = [];
  const turns = new Map<string, Promise<SessionTurnOutcome>>();
  const hangs = new Map<string, (outcome: SessionTurnOutcome) => void>();
  let ids = 0;
  const repository = memoryRepository();
  const module = new ScriptRunModule({
    repository,
    getSession: async (id) => sessions.get(id) ?? null,
    saveSession: async (record) => {
      sessions.set(record.id, record);
    },
    saveAgent: (agent) => repository.saveAgent(agent),
    getAgentRole: async () => null,
    hasActiveTurn: () => false,
    getSetting: async () => JSON.stringify(settings),
    setSetting: async () => {},
    sendSessionMessage: async (command) => {
      sent.push(command);
      const content = reply(command.content);
      turns.set(
        command.sessionId,
        content === "hang"
          ? new Promise((resolve) => hangs.set(command.sessionId, resolve))
          : Promise.resolve({
              status: "completed",
              message: { content } as MessageRecord,
            }),
      );
      return { id: `m-${sent.length}` } as MessageRecord;
    },
    waitForSessionTurn: async (id) => turns.get(id) ?? null,
    stopSession: async (id) => {
      stopped.push(id);
      hangs.get(id)?.({ status: "cancelled" });
    },
    broadcast: (event) => events.push(event),
    now: () => "2026-09-16T00:00:00.000Z",
    createId: () => `id-${++ids}`,
    maxConcurrency: 4,
  });

  const waitForRun = async (runId: string) => {
    for (let index = 0; index < 200; index += 1) {
      const snapshot = await module.get(runId);
      if (snapshot.run.completedAt) return snapshot;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error("run did not finish");
  };

  return { module, sessions, sent, stopped, events, waitForRun };
}

describe("ScriptRunModule", () => {
  it("validates drafts before they can run", async () => {
    const { module, sessions } = harness((prompt) => prompt);
    await expect(
      module.create({
        requesterSessionId: "lead",
        name: "Bad Name",
        script: "",
      }),
    ).rejects.toMatchObject({ code: "invalid_name" });
    await expect(
      module.create({
        requesterSessionId: "lead",
        name: "audit",
        script: "return (",
      }),
    ).rejects.toMatchObject({ code: "invalid_script" });
    sessions.set("child", session({ id: "child", sessionKind: "subagent" }));
    await expect(
      module.create({ requesterSessionId: "child", name: "audit", script: "" }),
    ).rejects.toMatchObject({ code: "requester_not_main" });
  });

  it("runs agents as requester subagents and reports the result back", async () => {
    const { module, sessions, sent, waitForRun } = harness(
      (prompt) => `done: ${prompt}`,
    );
    const draft = await module.create({
      requesterSessionId: "lead",
      name: "audit",
      script: `const items = await pipeline(["a", "b"], (x) => agent(x, { label: x }));
               return items;`,
    });
    expect(draft).toMatchObject({ status: "draft", maxAgents: 5 });
    await module.start({ runId: draft.id });
    const { run, agents } = await waitForRun(draft.id);

    expect(run).toMatchObject({
      status: "completed",
      agentCount: 2,
      resultJson: '["done: a","done: b"]',
    });
    expect(agents.map((agent) => [agent.label, agent.status])).toEqual([
      ["a", "completed"],
      ["b", "completed"],
    ]);
    const child = sessions.get(agents[0]?.sessionId ?? "");
    expect(child).toMatchObject({
      sessionKind: "subagent",
      parentSessionId: "lead",
      agentType: "codex",
      permissionMode: "codex-auto",
    });
    const report = sent.at(-1);
    expect(report).toMatchObject({
      sessionId: "lead",
      origin: { kind: "scriptRun", runId: draft.id, runName: "audit" },
    });
    expect(report?.content).toContain('["done: a","done: b"]');
  });

  it("retries schema replies up to the configured attempts", async () => {
    let calls = 0;
    const { module, sent, waitForRun } = harness(
      () => {
        calls += 1;
        return calls < 3 ? "not json" : '{"ok": true}';
      },
      { schemaMaxAttempts: 3 },
    );
    const draft = await module.create({
      requesterSessionId: "lead",
      name: "check",
      script: `return await agent("check", { schema: { type: "object", required: ["ok"] } });`,
    });
    await module.start({ runId: draft.id });
    const { run } = await waitForRun(draft.id);
    expect(run.resultJson).toBe('{"ok":true}');
    expect(sent.filter((command) => command.sessionId !== "lead")).toHaveLength(
      3,
    );
  });

  it("discards a draft without starting or reporting it", async () => {
    const { module, sent } = harness((prompt) => prompt);
    const draft = await module.create({
      requesterSessionId: "lead",
      name: "audit",
      script: "return 1;",
    });
    expect(await module.cancel(draft.id)).toMatchObject({
      status: "cancelled",
      completedAt: "2026-09-16T00:00:00.000Z",
    });
    await expect(module.start({ runId: draft.id })).rejects.toMatchObject({
      code: "not_draft",
    });
    expect(sent).toEqual([]);
  });

  it("fails the run once the agent limit is exceeded", async () => {
    const { module, waitForRun } = harness((prompt) => prompt);
    const draft = await module.create({
      requesterSessionId: "lead",
      name: "many",
      script: `await agent("one"); await agent("two");`,
    });
    await module.start({ runId: draft.id, maxAgents: 1 });
    const { run } = await waitForRun(draft.id);
    expect(run).toMatchObject({
      status: "failed",
      error: "Agent limit of 1 reached.",
      agentCount: 1,
    });
  });

  it("cancels running agents and only reports panel cancellations", async () => {
    const first = harness(() => "hang");
    const draft = await first.module.create({
      requesterSessionId: "lead",
      name: "slow",
      script: `await agent("wait");`,
    });
    await first.module.start({ runId: draft.id });
    await new Promise((resolve) => setTimeout(resolve, 50));
    await first.module.cancel(draft.id);
    const cancelled = await first.waitForRun(draft.id);
    expect(cancelled.run.status).toBe("cancelled");
    expect(first.stopped).toHaveLength(1);
    expect(first.sent.at(-1)?.origin).toMatchObject({ kind: "scriptRun" });

    const second = harness(() => "hang");
    const other = await second.module.create({
      requesterSessionId: "lead",
      name: "slow",
      script: `await agent("wait");`,
    });
    await second.module.start({ runId: other.id });
    await new Promise((resolve) => setTimeout(resolve, 50));
    await second.module.cancelForRequester("lead");
    expect((await second.waitForRun(other.id)).run.status).toBe("cancelled");
    expect(second.sent.some((command) => command.sessionId === "lead")).toBe(
      false,
    );
  });
});
