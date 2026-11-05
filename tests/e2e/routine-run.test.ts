import { requestDaemon } from "@cocurdex/daemon/client";
import type { PersonalAgentRecord, RoutineRunRecord } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { saveStubProvider } from "@cocurdex/test-harness/helpers/chat-session";
import { spawnDaemon } from "@cocurdex/test-harness/helpers/daemon-process";
import { startStubLlmServer } from "@cocurdex/test-harness/helpers/llm-stub";
import { afterAll, describe, expect, it } from "vitest";
import { runCli } from "./helpers/cli";

const tempDirs = createTempDirs();

async function waitForRun(
  read: () => Promise<RoutineRunRecord[]>,
  done: (runs: RoutineRunRecord[]) => boolean,
) {
  const deadline = Date.now() + 20_000;
  for (;;) {
    const runs = await read();
    if (done(runs)) return runs;
    if (Date.now() > deadline) {
      throw new Error(`Routine run did not finish: ${JSON.stringify(runs)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

describe("routines", () => {
  afterAll(async () => {
    await tempDirs.cleanup();
  });

  it("runs a routine in its own persona thread and cleans up with the persona", async () => {
    const stub = await startStubLlmServer();
    const daemon = await spawnDaemon();
    try {
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
      const created = await runCli(
        [
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
          "--json",
        ],
        { userDataPath: daemon.userDataPath },
      );
      expect(created.code).toBe(0);
      const coach = JSON.parse(created.stdout) as PersonalAgentRecord;

      const routine = await requestDaemon(
        "routine.create",
        {
          agentId: coach.id,
          name: "Morning check",
          prompt: "Summarize my day",
          schedule: { kind: "daily", time: "08:00", weekdays: null },
          timeZone: "UTC",
        },
        daemon.options,
      );
      expect(routine).toMatchObject({
        access: "read-and-draft",
        deliver: "inbox",
        pausedReason: null,
      });

      stub.plan = { kind: "stream", chunks: ["Three meetings", " today"] };
      const started = await requestDaemon(
        "routine.run",
        { id: routine.id },
        daemon.options,
      );
      expect(started).toMatchObject({ trigger: "manual", status: "running" });

      const runs = await waitForRun(
        () =>
          requestDaemon(
            "routine.runs",
            { routineId: routine.id },
            daemon.options,
          ),
        (list) => list[0]?.status !== "running",
      );
      expect(runs[0]).toMatchObject({
        status: "succeeded",
        summary: "Three meetings today",
      });
      const sessionId = runs[0].sessionId;
      expect(sessionId).not.toBeNull();
      expect(sessionId).not.toBe(coach.homeSessionId);

      const session = await requestDaemon(
        "session.get",
        { sessionId: sessionId as string },
        daemon.options,
      );
      expect(session).toMatchObject({
        sessionKind: "personal",
        agentRoleId: coach.role.id,
        title: "Morning check",
      });
      const { messages } = await requestDaemon(
        "session.listMessages",
        { sessionId: sessionId as string },
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

      await requestDaemon(
        "personalAgent.delete",
        { id: coach.id },
        daemon.options,
      );
      expect(await requestDaemon("routine.list", {}, daemon.options)).toEqual(
        [],
      );
      expect(
        await requestDaemon(
          "session.get",
          { sessionId: sessionId as string },
          daemon.options,
        ),
      ).toBeNull();
    } finally {
      await daemon.dispose();
      await stub.close();
    }
  });
});
