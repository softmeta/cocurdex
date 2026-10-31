import { createAgentRegistry } from "@cocurdex/agent-core";
import { CocurdexDaemonService } from "@cocurdex/daemon/internal/service";
import type { AgentId, MessageRecord } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

const cleanup: Array<() => Promise<void>> = [];
const tempDirs = createTempDirs();
afterAll(() => tempDirs.cleanup());
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
});

interface DispatchCall {
  agentType: AgentId;
  content: string;
  historyIds: string[];
}

async function fixture() {
  const root = await tempDirs.create("cocurdex-handoff-");
  const service = new CocurdexDaemonService({
    userDataPath: root,
    runtimeFingerprint: "test",
  });
  cleanup.push(async () => {
    await service.shutdown();
  });
  const registry = createAgentRegistry().list();
  vi.spyOn(service, "listAgents").mockResolvedValue(
    registry
      .filter((agent) => agent.id === "pi" || agent.id === "codex")
      .map((agent) => ({ ...agent, availability: "available" as const })),
  );
  vi.spyOn(service.runtime, "createSessionRuntime").mockImplementation(
    () => ({}) as never,
  );
  const calls: DispatchCall[] = [];
  vi.spyOn(service.runtime, "sendSessionMessage").mockImplementation(
    async (payload, options) => {
      calls.push({
        agentType: payload.session.agentType,
        content: options.contextHandoff
          ? `${options.contextHandoff.text}\n\n${payload.content}`
          : payload.content,
        historyIds: options.history.map((message) => message.id),
      });
      const reply: MessageRecord = {
        id: crypto.randomUUID(),
        sessionId: payload.session.id,
        role: "assistant",
        content: `${payload.session.agentType} answer ${calls.length}`,
        attachments: [],
        createdAt: new Date().toISOString(),
      };
      const startedAt = new Date().toISOString();
      service.runtime.emitAgentEvent({
        type: "tool.finished",
        sessionId: payload.session.id,
        toolCall: {
          id: crypto.randomUUID(),
          sessionId: payload.session.id,
          title: "test",
          kind: "exec",
          status: "failed",
          content: [],
          locations: [],
          rawInput: {
            command: `${payload.session.agentType} test ${calls.length}`,
          },
          rawOutput: { exitCode: 1, stdout: "1 failing" },
          startedAt,
          updatedAt: startedAt,
        },
      });
      service.runtime.emitAgentEvent({
        type: "message.completed",
        sessionId: payload.session.id,
        message: reply,
      });
      await service.state.saveProviderSession(payload.session.agentType, {
        sessionId: payload.session.id,
        providerSessionId: `${payload.session.agentType}-thread`,
        providerStateJson: "{}",
        providerVersion: null,
        resumable: true,
        updatedAt: reply.createdAt,
      });
      return reply;
    },
  );
  const now = new Date().toISOString();
  await service.saveWorkspace({
    id: "workspace-1",
    name: "Workspace",
    rootPaths: [root],
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    sortOrder: 1,
  });
  await configure(service, "session-1", "pi");
  return { service, calls };
}

function configure(
  service: CocurdexDaemonService,
  sessionId: string,
  agentType: AgentId,
) {
  return service.saveSessionConfiguration({
    id: sessionId,
    workspaceId: "workspace-1",
    title: "Task",
    agentType,
    writeMode: "read-only",
    sessionModeId: null,
  });
}

async function send(
  service: CocurdexDaemonService,
  sessionId: string,
  content: string,
) {
  const message = await service.sendSessionMessage({
    sessionId,
    messageId: crypto.randomUUID(),
    content,
  });
  await service.waitForSessionTurn(sessionId);
  expect(service.runs.hasActiveRun(sessionId)).toBe(false);
  return message;
}

describe("context transfers", () => {
  it("hands the conversation to a new agent and only the delta back", async () => {
    const { service, calls } = await fixture();
    const first = await send(service, "session-1", "first");
    expect(calls[0]).toMatchObject({ agentType: "pi", content: "first" });

    await service.switchSessionAgent("session-1", "codex");
    const second = await send(service, "session-1", "second");
    expect(calls[1]?.agentType).toBe("codex");
    expect(calls[1]?.content).toMatch(
      /^<cocurdex_context_handoff kind="agent_switch" strategy="full">/,
    );
    expect(calls[1]?.content).toMatch(
      /\[#\d+ Assistant \(pi\) · item=[^\]]+\]\npi answer 1/,
    );
    expect(calls[1]?.content.endsWith("\n\nsecond")).toBe(true);
    expect(calls[1]?.historyIds).toEqual([second.id]);

    await service.switchSessionAgent("session-1", "pi");
    await send(service, "session-1", "third");
    expect(calls[2]?.content).toContain('strategy="delta"');
    expect(calls[2]?.content).toContain("codex answer 2");
    expect(calls[2]?.content).not.toContain("pi answer 1");
    expect(calls[2]?.historyIds).toContain(first.id);

    await send(service, "session-1", "fourth");
    expect(calls[3]?.content).toBe("fourth");

    const transfers = service.listContextTransfers("session-1");
    expect(
      transfers.map((transfer) => [
        transfer.kind,
        transfer.strategy,
        transfer.sourceAgentTypes,
        transfer.targetAgentType,
      ]),
    ).toEqual([
      ["agent_switch", "full", ["pi"], "codex"],
      ["agent_switch", "delta", ["codex"], "pi"],
    ]);
    expect(
      (await service.state.listMessagesBySessionId("session-1")).find(
        (message) => message.id === second.id,
      )?.content,
    ).toBe("second");
  });

  it("continues a fork on a natively forked provider thread", async () => {
    const { service, calls } = await fixture();
    const forkThread = vi
      .spyOn(service.runtime, "forkProviderSession")
      .mockImplementation(async (agentType, payload) => ({
        ...payload.source,
        sessionId: payload.targetSessionId,
        providerSessionId: `${agentType}-forked-thread`,
      }));
    await send(service, "session-1", "explore");

    const fork = await service.forkSession({ sessionId: "session-1" });
    expect(forkThread).toHaveBeenCalledWith(
      "pi",
      expect.objectContaining({
        targetSessionId: fork.id,
        source: expect.objectContaining({ providerSessionId: "pi-thread" }),
      }),
    );
    expect(
      (await service.state.getProviderSession(fork.id, "pi"))
        ?.providerSessionId,
    ).toBe("pi-forked-thread");

    await send(service, fork.id, "tangent");
    expect(calls[1]?.content).toBe("tangent");
    expect(calls[1]?.historyIds).toHaveLength(3);
    expect(service.listContextTransfers(fork.id)).toMatchObject([
      {
        kind: "fork",
        status: "consumed",
        strategy: "native",
        handoffText: null,
        coveredMessageCount: 2,
      },
    ]);
  });

  it("skips native forks for threads that missed later turns", async () => {
    const { service, calls } = await fixture();
    const forkThread = vi
      .spyOn(service.runtime, "forkProviderSession")
      .mockImplementation(async (_agentType, payload) => ({
        ...payload.source,
        sessionId: payload.targetSessionId,
      }));
    await send(service, "session-1", "first");
    await service.switchSessionAgent("session-1", "codex");
    await send(service, "session-1", "second");

    const fork = await service.forkSession({ sessionId: "session-1" });
    expect(forkThread.mock.calls.map(([agentType]) => agentType)).toEqual([
      "codex",
    ]);

    await service.switchSessionAgent(fork.id, "pi");
    await send(service, fork.id, "third");
    expect(calls[2]?.content).toMatch(/kind="fork" strategy="full"/);
  });

  it("forks natively through the end of the chosen turn", async () => {
    const { service, calls } = await fixture();
    const forkThread = vi
      .spyOn(service.runtime, "forkProviderSession")
      .mockImplementation(async (agentType, payload) => ({
        ...payload.source,
        sessionId: payload.targetSessionId,
        providerSessionId: `${agentType}-turn-${payload.userTurnCount}`,
      }));
    const first = await send(service, "session-1", "first");
    await send(service, "session-1", "second");

    const fork = await service.forkSession({
      sessionId: "session-1",
      throughMessageId: first.id,
    });
    expect(forkThread).toHaveBeenCalledWith(
      "pi",
      expect.objectContaining({ userTurnCount: 1 }),
    );
    expect(
      (await service.state.listMessagesBySessionId(fork.id)).map(
        (message) => message.content,
      ),
    ).toEqual(["first", "pi answer 1"]);

    await send(service, fork.id, "tangent");
    expect(calls[2]?.content).toBe("tangent");
  });

  it("falls back to a handoff when the agent cannot fork that point", async () => {
    const { service, calls } = await fixture();
    vi.spyOn(service.runtime, "forkProviderSession").mockResolvedValue(null);
    const first = await send(service, "session-1", "first");
    await send(service, "session-1", "second");

    const fork = await service.forkSession({
      sessionId: "session-1",
      throughMessageId: first.id,
    });
    await send(service, fork.id, "tangent");
    expect(calls[2]?.content).toMatch(/kind="fork" strategy="full"/);
    expect(calls[2]?.content).not.toContain("second");
  });

  it("forks a session lazily and resolves the transfer on first send", async () => {
    const { service, calls } = await fixture();
    await send(service, "session-1", "explore");

    const fork = await service.forkSession({ sessionId: "session-1" });
    expect(fork.id).not.toBe("session-1");
    expect(
      (await service.state.listMessagesBySessionId(fork.id)).map(
        (message) => message.content,
      ),
    ).toEqual(["explore", "pi answer 1"]);
    expect(service.listContextTransfers(fork.id)).toMatchObject([
      { kind: "fork", status: "pending", sourceSessionId: "session-1" },
    ]);

    const followUp = await send(service, fork.id, "tangent");
    expect(calls[1]?.content).toMatch(/kind="fork" strategy="full"/);
    expect(calls[1]?.content).toMatch(/\[#\d+ User · item=[^\]]+\]\nexplore/);
    expect(calls[1]?.historyIds).toEqual([followUp.id]);
    expect(service.listContextTransfers(fork.id)).toMatchObject([
      {
        kind: "fork",
        status: "consumed",
        targetAgentType: "pi",
        sourceAgentTypes: ["pi"],
        consumedByMessageId: followUp.id,
      },
    ]);
  });

  it("hands foreign commands over and lets the agent read omitted history back", async () => {
    const { service, calls } = await fixture();
    await send(service, "session-1", "first");
    await service.switchSessionAgent("session-1", "codex");
    await send(service, "session-1", "second");
    expect(calls[1]?.content).toContain("Command: pi test 1\nStatus: failed");
    expect(calls[1]?.content).toContain("Exit code: 1");
    expect(calls[1]?.content).not.toContain("codex test");

    const caller = {
      sessionId: "session-1",
      sessionKind: "main" as const,
      workspaceId: "workspace-1",
      teamId: null,
    };
    const page = (await service.agentTools.registry.call(
      caller,
      "history_read",
      { limit: 3 },
    )) as { items: Array<{ text: string }>; olderBeforePosition: number };
    expect(page.items.map((item) => item.text)).toEqual([
      "second",
      expect.stringContaining("Command: codex test 2"),
      "codex answer 2",
    ]);
    const older = (await service.agentTools.registry.call(
      caller,
      "history_read",
      { beforePosition: page.olderBeforePosition },
    )) as { items: Array<{ text: string }> };
    expect(older.items.map((item) => item.text)).toEqual([
      "first",
      expect.stringContaining("Command: pi test 1"),
      "pi answer 1",
    ]);
    await expect(
      service.agentTools.registry.call(caller, "history_read", {
        sessionId: "elsewhere",
      }),
    ).rejects.toThrow("not this session");
  });
});
