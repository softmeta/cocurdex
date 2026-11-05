import { requestDaemon } from "@cocurdex/daemon/client";
import type {
  InboxItem,
  PersonalAgentRecord,
  RoutineRecord,
  RoutineRunRecord,
} from "@cocurdex/shared";
import { saveStubProvider } from "@cocurdex/test-harness/helpers/chat-session";
import { spawnDaemon } from "@cocurdex/test-harness/helpers/daemon-process";
import {
  type StubLlmRequest,
  startStubLlmServer,
} from "@cocurdex/test-harness/helpers/llm-stub";
import { describe, expect, it } from "vitest";
import { runCli } from "./helpers/cli";

function toolResults(request: StubLlmRequest | undefined) {
  const messages = (request?.body.messages ?? []) as {
    role: string;
    content: unknown;
  }[];
  return messages
    .filter((message) => message.role === "tool")
    .map((message) =>
      typeof message.content === "string"
        ? message.content
        : JSON.stringify(message.content),
    );
}

async function setUp() {
  const stub = await startStubLlmServer();
  const daemon = await spawnDaemon();
  await saveStubProvider(daemon, stub);
  const now = new Date().toISOString();
  await requestDaemon(
    "provider.model.save",
    {
      model: {
        providerId: "e2e-stub",
        modelId: "e2e-agent-model",
        name: "E2E Agent Model",
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
  const cli = async <T>(args: string[]) => {
    const result = await runCli([...args, "--json"], {
      userDataPath: daemon.userDataPath,
    });
    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    return JSON.parse(result.stdout) as T;
  };
  const coach = await cli<PersonalAgentRecord>([
    "persona",
    "create",
    "--name",
    "Coach",
    "--agent",
    "pi",
    "--provider",
    "e2e-stub",
    "--model",
    "e2e-agent-model",
  ]);
  return {
    stub,
    daemon,
    cli,
    coach,
    async dispose() {
      await daemon.dispose();
      await stub.close();
    },
  };
}

describe("routines", () => {
  it("runs a routine from the CLI in its own thread and cleans up with the persona", async () => {
    const { stub, daemon, cli, coach, dispose } = await setUp();
    try {
      const routine = await cli<RoutineRecord>([
        "routine",
        "create",
        "--persona",
        "Coach",
        "--name",
        "Morning check",
        "--prompt",
        "Summarize my day",
        "--at",
        "08:00",
        "--days",
        "weekdays",
        "--tz",
        "UTC",
      ]);
      expect(routine).toMatchObject({
        agentId: coach.id,
        schedule: { kind: "daily", time: "08:00", weekdays: [1, 2, 3, 4, 5] },
        access: "read-and-draft",
        deliver: "inbox",
      });

      const paused = await cli<RoutineRecord>([
        "routine",
        "pause",
        "Morning check",
      ]);
      expect(paused.pausedReason).toBe("user");
      const resumed = await cli<RoutineRecord>([
        "routine",
        "update",
        routine.id,
        "--every",
        "90",
        "--deliver",
        "push",
      ]);
      expect(resumed).toMatchObject({
        schedule: { kind: "interval", minutes: 90 },
        deliver: "push",
        pausedReason: "user",
      });
      await cli(["routine", "resume", routine.id]);

      stub.plan = { kind: "stream", chunks: ["Three meetings", " today"] };
      const run = await cli<RoutineRunRecord>([
        "routine",
        "run",
        "Morning check",
        "--wait",
      ]);
      expect(run).toMatchObject({
        trigger: "manual",
        status: "succeeded",
        summary: "Three meetings today",
      });
      expect(run.sessionId).not.toBe(coach.homeSessionId);
      const runs = await cli<RoutineRunRecord[]>([
        "routine",
        "runs",
        "Morning check",
      ]);
      expect(runs.map((entry) => entry.id)).toEqual([run.id]);

      const sessionId = run.sessionId as string;
      expect(
        await requestDaemon("session.get", { sessionId }, daemon.options),
      ).toMatchObject({
        sessionKind: "personal",
        agentRoleId: coach.role.id,
        title: "Morning check",
      });
      const { messages } = await requestDaemon(
        "session.listMessages",
        { sessionId },
        daemon.options,
      );
      expect(messages.find((message) => message.role === "user")).toMatchObject(
        {
          content: "Summarize my day",
          origin: {
            kind: "routine",
            routineId: routine.id,
            routineName: "Morning check",
          },
        },
      );

      const inbox = await cli<InboxItem[]>(["inbox"]);
      expect(inbox).toEqual([
        expect.objectContaining({
          id: `routine:${routine.id}`,
          kind: "routine-result",
          form: "personal",
          sessionId,
          detail: "Three meetings today",
        }),
      ]);
      await cli(["inbox", "read", `routine:${routine.id}`]);
      expect(await cli(["inbox"])).toEqual([]);

      await cli(["persona", "delete", coach.id]);
      expect(await cli(["routine", "list"])).toEqual([]);
      expect(
        await requestDaemon("session.get", { sessionId }, daemon.options),
      ).toBeNull();
    } finally {
      await dispose();
    }
  });

  it("lets an assistant schedule its own routines but not touch full-access ones", async () => {
    const { stub, cli, coach, dispose } = await setUp();
    try {
      const guarded = await cli<RoutineRecord>([
        "routine",
        "create",
        "--persona",
        coach.id,
        "--name",
        "Deploy",
        "--prompt",
        "Ship the release",
        "--every",
        "60",
        "--access",
        "full",
      ]);
      stub.plan = {
        kind: "script",
        turns: [
          {
            toolCalls: [
              {
                name: "routine_create",
                arguments: {
                  name: "Weekly review",
                  prompt: "Review my week",
                  schedule: { kind: "daily", time: "18:00", weekdays: [5] },
                  timeZone: "Asia/Shanghai",
                },
              },
              {
                name: "routine_update",
                arguments: { id: guarded.id, prompt: "Delete everything" },
              },
            ],
          },
          { text: ["Scheduled"] },
        ],
      };
      await cli([
        "persona",
        "send",
        coach.id,
        "Review my week every Friday evening",
        "--wait",
      ]);

      const routines = await cli<RoutineRecord[]>([
        "routine",
        "list",
        "--persona",
        coach.id,
      ]);
      expect(routines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "Weekly review",
            agentId: coach.id,
            access: "read-and-draft",
            timeZone: "Asia/Shanghai",
          }),
          expect.objectContaining({
            id: guarded.id,
            prompt: "Ship the release",
          }),
        ]),
      );
      expect(toolResults(stub.requests[1]).join("\n")).toContain(
        "Only the user can change or run a routine with full access",
      );
    } finally {
      await dispose();
    }
  });
});
