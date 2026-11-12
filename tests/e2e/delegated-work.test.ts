import { requestDaemon } from "@cocurdex/daemon/client";
import type {
  AgentRoleRecord,
  DelegatedWorkRecord,
  MessageRecord,
  PersonalAgentRecord,
  WorkspaceRecord,
} from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { saveStubProvider } from "@cocurdex/test-harness/helpers/chat-session";
import { spawnDaemon } from "@cocurdex/test-harness/helpers/daemon-process";
import { startStubLlmServer } from "@cocurdex/test-harness/helpers/llm-stub";
import { afterAll, describe, expect, it } from "vitest";
import { runCli } from "./helpers/cli";

const tempDirs = createTempDirs();

afterAll(() => tempDirs.cleanup());

type Daemon = Awaited<ReturnType<typeof spawnDaemon>>;

async function eventually<T>(
  read: () => Promise<T>,
  accept: (value: T) => boolean,
  timeoutMs = 20_000,
) {
  const deadline = Date.now() + timeoutMs;
  let value = await read();
  while (!accept(value)) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out; last value: ${JSON.stringify(value)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    value = await read();
  }
  return value;
}

async function saveModel(daemon: Daemon) {
  const now = new Date().toISOString();
  await requestDaemon(
    "provider.model.save",
    {
      model: {
        providerId: "e2e-stub",
        modelId: "e2e-agent-model",
        name: "e2e-agent-model",
        api: "openai-completions",
        enabled: true,
        source: "manual",
        capabilities: ["chat", "agent"],
        createdAt: now,
        updatedAt: now,
      },
    },
    daemon.options,
  );
}

function saveRole(daemon: Daemon, name: string) {
  return requestDaemon(
    "agentRole.save",
    {
      name,
      agentId: "pi",
      providerId: "e2e-stub",
      modelId: "e2e-agent-model",
      modelName: "e2e-agent-model",
      permissionMode: null,
      sessionModeId: null,
      reasoningEffort: null,
      serviceTier: null,
      fastMode: null,
      thinkingLevel: null,
      openCodeAgent: null,
      openCodeVariant: null,
    },
    daemon.options,
  );
}

async function setUp() {
  const stub = await startStubLlmServer();
  const daemon = await spawnDaemon();
  await saveStubProvider(daemon, stub);
  await saveModel(daemon);
  const now = new Date().toISOString();
  const workspace: WorkspaceRecord = {
    id: "e2e-shop",
    name: "Shop",
    rootPaths: [tempDirs.createSync("cocurdex-e2e-delegate-")],
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    sortOrder: 1000,
  };
  await requestDaemon("workspace.save", { workspace }, daemon.options);
  const builder: AgentRoleRecord = await saveRole(daemon, "Builder");
  const run = (args: string[]) =>
    runCli([...args, "--json"], { userDataPath: daemon.userDataPath });
  const cli = async <T>(args: string[]) => {
    const result = await run(args);
    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    return JSON.parse(result.stdout) as T;
  };
  const createPersona = (name: string) =>
    cli<PersonalAgentRecord>([
      "persona",
      "create",
      "--name",
      name,
      "--provider",
      "e2e-stub",
      "--model",
      "e2e-agent-model",
    ]);
  const messages = async (sessionId: string): Promise<MessageRecord[]> =>
    (await requestDaemon("session.snapshot", { sessionId }, daemon.options))
      ?.messages ?? [];
  return {
    stub,
    daemon,
    builder,
    run,
    cli,
    createPersona,
    messages,
    async dispose() {
      await daemon.dispose();
      await stub.close();
    },
  };
}

describe("delegated work", () => {
  it("delegates from the assistant thread and wakes it with the result", async () => {
    const { stub, builder, cli, createPersona, messages, dispose } =
      await setUp();
    try {
      const coach = await createPersona("Coach");
      stub.plan = {
        kind: "script",
        turns: [
          {
            toolCalls: [
              {
                name: "work_start",
                arguments: {
                  workspace: "Shop",
                  prompt: "Fix the checkout bug",
                  title: "Fix checkout",
                  agentRole: "Builder",
                },
              },
            ],
          },
          { text: ["Checkout fixed"] },
          { text: ["Checkout fixed"] },
          { text: ["Checkout fixed"] },
        ],
      };
      await cli([
        "persona",
        "send",
        "Coach",
        "Fix the checkout bug in Shop",
        "--wait",
      ]);

      const [work] = await eventually(
        () => cli<DelegatedWorkRecord[]>(["persona", "work", "list", "Coach"]),
        (works) => works[0]?.state === "completed",
      );
      expect(work).toMatchObject({
        personaId: coach.id,
        title: "Fix checkout",
        workspaceId: "e2e-shop",
        workspaceName: "Shop",
        agentType: "pi",
        agentRoleId: builder.id,
      });

      const [briefing] = await messages(work.sessionId);
      expect(briefing).toMatchObject({
        role: "user",
        origin: { kind: "peer", sessionId: coach.homeSessionId },
      });
      expect(briefing.content).toContain("Fix the checkout bug");

      const thread = await eventually(
        () => messages(coach.homeSessionId),
        (items) => {
          const report = items.findIndex(
            (item) =>
              item.role === "user" &&
              item.origin?.kind === "delegation" &&
              item.origin.sessionId === work.sessionId,
          );
          return (
            report >= 0 &&
            items
              .slice(report + 1)
              .some(
                (item) => item.role === "assistant" && item.kind === "response",
              )
          );
        },
      );
      const report = thread.find(
        (item) =>
          item.origin?.kind === "delegation" &&
          item.origin.sessionId === work.sessionId,
      );
      expect(report?.origin).toMatchObject({ outcome: "finished" });
      expect(report?.content).toContain('Work session "Fix checkout"');
      expect(report?.content).toContain("Checkout fixed");
    } finally {
      await dispose();
    }
  });

  it("wakes the assistant only for reported outcomes and tracks them on the issue", async () => {
    const { stub, cli, createPersona, messages, dispose } = await setUp();
    try {
      const coach = await createPersona("Coach");
      const issue = await cli<{ id: string; identifier: string }>([
        "issue",
        "create",
        "--title",
        "Checkout totals are wrong",
        "--status",
        "backlog",
      ]);
      stub.plan = {
        kind: "script",
        turns: [
          {
            toolCalls: [
              {
                name: "work_report",
                arguments: { status: "dropped", summary: "Cannot reproduce" },
              },
            ],
          },
          { text: ["Could not reproduce it"] },
          {
            toolCalls: [
              {
                name: "work_report",
                arguments: {
                  status: "ready",
                  summary: "Totals fixed; rounding untested on refunds",
                },
              },
            ],
          },
          { text: ["Long worker transcript"] },
          { text: ["Totals are fixed"] },
        ],
      };
      const work = await cli<DelegatedWorkRecord>([
        "persona",
        "work",
        "start",
        "Coach",
        "--workspace",
        "Shop",
        "--prompt",
        "Fix the checkout totals",
        "--role",
        "Builder",
        "--issue",
        issue.identifier,
      ]);
      await eventually(
        () => cli<DelegatedWorkRecord[]>(["persona", "work", "list", "Coach"]),
        (works) => works[0]?.state === "completed",
      );
      await cli([
        "persona",
        "work",
        "send",
        "Coach",
        work.sessionId,
        "Try with a coupon applied",
      ]);
      const thread = await eventually(
        () => messages(coach.homeSessionId),
        (items) =>
          items.some(
            (item) => item.role === "assistant" && item.kind === "response",
          ),
      );
      const reports = thread.filter(
        (item) => item.origin?.kind === "delegation",
      );
      expect(reports).toHaveLength(1);
      expect(reports[0]?.origin).toMatchObject({
        sessionId: work.sessionId,
        outcome: "ready",
      });
      expect(reports[0]?.content).toContain(
        "Summary: Totals fixed; rounding untested on refunds",
      );
      expect(reports[0]?.content).not.toContain("Long worker transcript");

      const detail = await cli<{
        issue: { statusCategory: string | null };
        sessions: { sessionId: string }[];
        events: { kind: string; body: string | null }[];
      }>(["issue", "show", issue.id, "--detail"]);
      expect(detail.issue.statusCategory).toBe("started");
      expect(detail.sessions.map((link) => link.sessionId)).toEqual([
        work.sessionId,
      ]);
      expect(
        detail.events
          .filter((event) => event.kind === "commented")
          .map((event) => event.body),
      ).toEqual(["Totals fixed; rounding untested on refunds"]);
    } finally {
      await dispose();
    }
  });

  it("starts a team from a template and keeps each persona to its own work", async () => {
    const { stub, daemon, builder, run, cli, createPersona, dispose } =
      await setUp();
    try {
      const reviewer = await saveRole(daemon, "Reviewer");
      await requestDaemon(
        "teamTemplate.save",
        {
          name: "Release crew",
          members: [
            { agentRoleId: builder.id, prompt: "Build" },
            { agentRoleId: reviewer.id, prompt: "Review" },
          ],
        },
        daemon.options,
      );
      await createPersona("Coach");
      await createPersona("Scout");
      stub.plan = { kind: "stream", chunks: ["Planned"] };

      const work = await cli<DelegatedWorkRecord>([
        "persona",
        "work",
        "start",
        "Coach",
        "--workspace",
        "e2e-shop",
        "--prompt",
        "Plan the release",
        "--team",
        "release crew",
      ]);
      const team = await requestDaemon(
        "team.get",
        { leadSessionId: work.sessionId },
        daemon.options,
      );
      expect(team?.team.roster?.members.map((member) => member.name)).toEqual([
        "Reviewer",
      ]);
      expect(work).toMatchObject({
        agentRoleId: builder.id,
        teamTemplateId: expect.any(String),
      });

      const both = await run([
        "persona",
        "work",
        "start",
        "Coach",
        "--workspace",
        "Shop",
        "--prompt",
        "x",
        "--role",
        "Builder",
        "--team",
        "Release crew",
      ]);
      expect(both.code).not.toBe(0);
      expect(both.stderr).toContain("either an agent role or a team template");

      const personal = await run([
        "persona",
        "work",
        "start",
        "Coach",
        "--workspace",
        "Personal",
        "--prompt",
        "x",
      ]);
      expect(personal.code).not.toBe(0);
      expect(personal.stderr).toContain('No workspace matches "Personal"');

      const foreign = await run([
        "persona",
        "work",
        "stop",
        "Scout",
        work.sessionId,
      ]);
      expect(foreign.code).not.toBe(0);
      expect(foreign.stderr).toContain("No work session you delegated");
      expect(
        await cli<DelegatedWorkRecord[]>(["persona", "work", "list", "Scout"]),
      ).toEqual([]);

      const catalog = await cli<{
        workspaces: { id: string }[];
        agentRoles: { name: string }[];
        teamTemplates: { name: string; members: string[] }[];
      }>(["persona", "work", "catalog"]);
      expect(catalog.workspaces.map((item) => item.id)).toEqual(["e2e-shop"]);
      expect(catalog.agentRoles.map((item) => item.name).sort()).toEqual([
        "Builder",
        "Reviewer",
      ]);
      expect(catalog.teamTemplates).toEqual([
        expect.objectContaining({
          name: "Release crew",
          members: ["Builder", "Reviewer"],
        }),
      ]);
    } finally {
      await dispose();
    }
  });
});
