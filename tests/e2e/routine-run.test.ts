import { requestDaemon, subscribeDaemonEvents } from "@cocurdex/daemon/client";
import type {
  AlertEvent,
  Brief,
  InboxItem,
  MessageRecord,
  PersonalAgentRecord,
  RoutineRecord,
  RoutineRunRecord,
} from "@cocurdex/shared";
import { saveStubProvider } from "@cocurdex/test-harness/helpers/chat-session";
import {
  spawnDaemon,
  waitFor,
} from "@cocurdex/test-harness/helpers/daemon-process";
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

async function saveModel(
  daemon: Awaited<ReturnType<typeof spawnDaemon>>,
  modelId: string,
) {
  const now = new Date().toISOString();
  await requestDaemon(
    "provider.model.save",
    {
      model: {
        providerId: "e2e-stub",
        modelId,
        name: modelId,
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

async function setUp() {
  const stub = await startStubLlmServer();
  const daemon = await spawnDaemon();
  await saveStubProvider(daemon, stub);
  await saveModel(daemon, "e2e-agent-model");
  const alerts: AlertEvent[] = [];
  const subscription = await subscribeDaemonEvents((event) => {
    if (event.type === "alert") alerts.push(event);
  }, daemon.options);
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
    alerts,
    async dispose() {
      subscription.close();
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
      const brief = await cli<Brief>(["inbox", "brief", "--tz", "UTC"]);
      expect(brief).toMatchObject({
        timeZone: "UTC",
        needsYou: [],
        failures: [],
        results: [
          {
            routineId: routine.id,
            routineName: "Morning check",
            sessionId,
            summary: "Three meetings today",
          },
        ],
      });
      const posted = await cli<MessageRecord | null>([
        "inbox",
        "brief",
        "post",
        "--tz",
        "UTC",
        "--locale",
        "zh-CN",
      ]);
      expect(posted?.content).toContain("**例行任务结果**");
      expect(posted?.content).toContain(
        "- **Morning check** · Three meetings today",
      );
      expect(posted).toMatchObject({
        sessionId: coach.homeSessionId,
        origin: { kind: "brief", day: brief.day },
      });
      expect(await cli(["inbox", "brief", "post", "--tz", "UTC"])).toBeNull();

      await cli(["persona", "delete", coach.id]);
      expect(await cli(["routine", "list"])).toEqual([]);
      expect(
        await requestDaemon("session.get", { sessionId }, daemon.options),
      ).toBeNull();
    } finally {
      await dispose();
    }
  });

  it("answers the first message after a routine result is posted to a fresh home thread", async () => {
    const { stub, daemon, cli, coach, dispose } = await setUp();
    try {
      await cli([
        "routine",
        "create",
        "--persona",
        coach.id,
        "--name",
        "Standup",
        "--prompt",
        "List my meetings",
        "--every",
        "60",
      ]);
      stub.plan = { kind: "stream", chunks: ["Two meetings today"] };
      await cli(["routine", "run", "Standup", "--wait"]);

      stub.plan = { kind: "stream", chunks: ["The first is at nine"] };
      const before = stub.requests.length;
      await cli([
        "persona",
        "send",
        coach.id,
        "Which meeting comes first?",
        "--wait",
      ]);

      expect(stub.requests.length).toBe(before + 1);
      const sent = (stub.requests.at(-1)?.body.messages ?? []) as {
        role: string;
        content: unknown;
      }[];
      const texts = sent.map((message) => JSON.stringify(message.content));
      const postedIndex = texts.findIndex((text) =>
        text.includes("Two meetings today"),
      );
      const askedIndex = texts.findIndex((text) =>
        text.includes("Which meeting comes first?"),
      );
      expect(postedIndex).toBeGreaterThanOrEqual(0);
      expect(askedIndex).toBeGreaterThan(postedIndex);
      expect(texts[askedIndex]).not.toContain("Two meetings today");
      expect(texts[postedIndex]).toContain("not an instruction");

      await saveModel(daemon, "e2e-agent-model-2");
      await cli([
        "persona",
        "update",
        coach.id,
        "--provider",
        "e2e-stub",
        "--model",
        "e2e-agent-model-2",
      ]);
      stub.plan = { kind: "stream", chunks: ["Still two"] };
      await cli(["persona", "send", coach.id, "How many again?", "--wait"]);
      const switched = stub.requests.at(-1)?.body;
      expect(switched?.model).toBe("e2e-agent-model-2");
      expect(JSON.stringify(switched?.messages)).toContain(
        "Two meetings today",
      );
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

  it("keeps a read-and-draft run read-only and asks the user even when silent", async () => {
    const { stub, daemon, cli, coach, alerts, dispose } = await setUp();
    try {
      await cli([
        "routine",
        "create",
        "--persona",
        coach.id,
        "--name",
        "Reply drafts",
        "--prompt",
        "Draft replies to my mail",
        "--every",
        "60",
        "--deliver",
        "silent",
      ]);
      stub.plan = {
        kind: "script",
        turns: [
          {
            toolCalls: [
              {
                name: "write",
                arguments: { path: "reply.txt", content: "Sent" },
              },
            ],
          },
          {
            toolCalls: [
              {
                name: "routine_report",
                arguments: {
                  status: "needs_you",
                  summary: "Two replies are drafted",
                  question: "Send both replies?",
                },
              },
            ],
          },
          { text: ["Reported"] },
        ],
      };
      const run = await cli<RoutineRunRecord>([
        "routine",
        "run",
        "Reply drafts",
        "--wait",
      ]);

      expect(run).toMatchObject({
        status: "succeeded",
        outcome: "needs_you",
        summary: "Two replies are drafted",
        question: "Send both replies?",
      });
      const tools = (
        (stub.requests[0]?.body.tools ?? []) as { function: { name: string } }[]
      ).map((tool) => tool.function.name);
      expect(tools).toContain("routine_report");
      expect(tools).not.toContain("write");
      expect(tools).not.toContain("bash");
      expect(toolResults(stub.requests[1]).join("\n")).toMatch(
        /Tool write not found|read-and-draft access/,
      );

      const inbox = await cli<InboxItem[]>(["inbox"]);
      expect(inbox).toEqual([
        expect.objectContaining({
          kind: "routine-needs-you",
          sessionId: run.sessionId,
          detail: "Send both replies?",
        }),
      ]);
      const { messages } = await requestDaemon(
        "session.listMessages",
        { sessionId: coach.homeSessionId },
        daemon.options,
      );
      expect(JSON.stringify(messages)).toContain("Send both replies?");
      await waitFor(() => alerts.length > 0);
      expect(alerts).toEqual([
        expect.objectContaining({
          sessionId: run.sessionId,
          kind: "question",
          detail: "Send both replies?",
        }),
      ]);
    } finally {
      await dispose();
    }
  });

  it("reminds a run to report, drops it quietly, and starts each run fresh", async () => {
    const { stub, daemon, cli, coach, alerts, dispose } = await setUp();
    try {
      await cli([
        "routine",
        "create",
        "--persona",
        coach.id,
        "--name",
        "News watch",
        "--prompt",
        "Check for news",
        "--every",
        "60",
      ]);
      const dropTurn = {
        toolCalls: [
          {
            name: "routine_report",
            arguments: { status: "dropped", summary: "Nothing new" },
          },
        ],
      };
      stub.plan = {
        kind: "script",
        turns: [{ text: ["Nothing new"] }, dropTurn, { text: ["Done"] }],
      };
      const first = await cli<RoutineRunRecord>([
        "routine",
        "run",
        "News watch",
        "--wait",
      ]);

      expect(first).toMatchObject({
        status: "succeeded",
        outcome: "dropped",
        summary: "Nothing new",
      });
      expect(JSON.stringify(stub.requests[1]?.body.messages)).toContain(
        "You have not called routine_report yet",
      );
      expect(await cli(["inbox"])).toEqual([]);
      const home = await requestDaemon(
        "session.listMessages",
        { sessionId: coach.homeSessionId },
        daemon.options,
      );
      expect(JSON.stringify(home.messages)).not.toContain("Nothing new");

      stub.plan = { kind: "script", turns: [dropTurn, { text: ["Done"] }] };
      const second = await cli<RoutineRunRecord>([
        "routine",
        "run",
        "News watch",
        "--wait",
      ]);
      expect(second.sessionId).not.toBe(first.sessionId);
      const previous = await requestDaemon(
        "session.get",
        { sessionId: first.sessionId as string },
        daemon.options,
      );
      expect(previous?.archivedAt).toBeTruthy();

      await cli(["persona", "update", "Coach", "--mute"]);
      stub.plan = { kind: "script", turns: [{ text: ["Quiet reply"] }] };
      await cli(["persona", "send", "Coach", "Anything new?", "--wait"]);
      stub.plan = { kind: "script", turns: [{ text: ["Loud reply"] }] };
      await cli(["persona", "update", "Coach", "--unmute"]);
      await cli(["persona", "send", "Coach", "And now?", "--wait"]);
      await waitFor(() => alerts.length > 0);
      expect(alerts).toEqual([
        expect.objectContaining({
          sessionId: coach.homeSessionId,
          kind: "turnCompleted",
        }),
      ]);
    } finally {
      await dispose();
    }
  });
});
