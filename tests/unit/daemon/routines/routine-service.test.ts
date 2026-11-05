import { DatabaseSync } from "node:sqlite";
import { RoutineService } from "@cocurdex/daemon/internal/routines/routine-service";
import type { SessionTurnOutcome } from "@cocurdex/daemon/internal/session-control/execution-types";
import { createSqliteRoutineRepository } from "@cocurdex/db";
import { initializeDatabase } from "@cocurdex/db/internal/migrations";
import type { MessageRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

const MINUTE = 60_000;

function seededDatabase() {
  const database = new DatabaseSync(":memory:");
  initializeDatabase(database);
  const now = "2026-11-05T00:00:00.000Z";
  database.exec(`
    INSERT INTO workspaces (id, name, root_paths, created_at, updated_at, last_opened_at)
    VALUES ('w1', 'Personal', '[]', '${now}', '${now}', '${now}');
    INSERT INTO agent_roles (id, name, agent_id, created_at, updated_at)
    VALUES ('r1', 'Coach', 'pi', '${now}', '${now}');
    INSERT INTO sessions (id, workspace_id, title, agent_type, status, write_mode, created_at, updated_at)
    VALUES ('home', 'w1', 'Coach', 'pi', 'idle', 'read-only', '${now}', '${now}');
    INSERT INTO personal_agents (id, role_id, home_session_id, is_default, created_at, updated_at)
    VALUES ('coach', 'r1', 'home', 1, '${now}', '${now}');
  `);
  return database;
}

function reply(content: string): SessionTurnOutcome {
  return {
    status: "completed",
    message: { id: "m", content } as MessageRecord,
  };
}

function harness(
  outcomes: SessionTurnOutcome[] | Record<string, SessionTurnOutcome> = [],
) {
  const repository = createSqliteRoutineRepository(seededDatabase());
  let clock = new Date("2026-11-05T09:00:00Z");
  const prompts: string[] = [];
  const delivered: { routine: string; run: string; content: string }[] = [];
  const service = new RoutineService({
    repository,
    personaExists: async (id) => id === "coach",
    ensureSession: async () => "routine-session",
    runTurn: async (routine) => {
      prompts.push(routine.prompt);
      const outcome = Array.isArray(outcomes)
        ? outcomes.shift()
        : outcomes[routine.prompt];
      return outcome ?? reply("All clear");
    },
    deliverResult: async (routine, run, content) => {
      delivered.push({ routine: routine.name, run: run.id, content });
    },
    announceChanged: () => {},
    now: () => clock,
  });
  const advance = async (ms: number) => {
    clock = new Date(clock.getTime() + ms);
    await service.tick();
    await service.idle();
  };
  const finished = () =>
    repository
      .listRuns(null, 200)
      .filter((run) => run.status !== "running" && run.status !== "skipped")
      .reverse();
  return { service, repository, prompts, delivered, finished, advance };
}

describe("RoutineService", () => {
  it("runs a routine when it is due and records the reply", async () => {
    const { service, prompts, finished, advance } = harness();
    const routine = await service.create({
      agentId: "coach",
      name: "Check in",
      prompt: "How is training going?",
      schedule: { kind: "interval", minutes: 60 },
      timeZone: "UTC",
    });

    await advance(59 * MINUTE);
    expect(prompts).toEqual([]);
    await advance(1 * MINUTE);
    expect(prompts).toEqual(["How is training going?"]);
    expect(finished()).toEqual([
      expect.objectContaining({
        trigger: "schedule",
        status: "succeeded",
        summary: "All clear",
        sessionId: "routine-session",
      }),
    ]);
    expect(service.get(routine.id)).toMatchObject({
      nextRunAt: "2026-11-05T11:00:00.000Z",
      sessionId: "routine-session",
    });
  });

  it("delivers each reply to the home thread unless the routine is silent", async () => {
    const { service, delivered, finished, advance } = harness({
      Morning: reply("  Two meetings today.  "),
      Broken: { status: "failed", error: "boom" },
      Silent: reply("Quiet one"),
    });
    const create = (name: string, deliver: "inbox" | "silent") =>
      service.create({
        agentId: "coach",
        name,
        prompt: name,
        schedule: { kind: "interval", minutes: 60 },
        timeZone: "UTC",
        deliver,
      });
    const morning = await create("Morning", "inbox");
    await create("Broken", "inbox");
    await create("Silent", "silent");

    await advance(60 * MINUTE);

    expect(finished()).toHaveLength(3);
    const morningRun = finished().find((run) => run.routineId === morning.id);
    expect(delivered).toEqual([
      {
        routine: "Morning",
        run: morningRun?.id,
        content: "Two meetings today.",
      },
    ]);
  });

  it("runs once to catch up after the machine slept through several runs", async () => {
    const { service, prompts, finished, advance } = harness();
    await service.create({
      agentId: "coach",
      name: "Hourly",
      prompt: "Ping",
      schedule: { kind: "interval", minutes: 60 },
      timeZone: "UTC",
    });

    await advance(6 * 60 * MINUTE);
    await advance(MINUTE);
    expect(prompts).toEqual(["Ping"]);
    expect(finished().map((run) => run.trigger)).toEqual(["catch-up"]);
  });

  it("backs off after a failure and pauses after three in a row", async () => {
    const failure: SessionTurnOutcome = { status: "failed", error: "boom" };
    const { service, prompts, finished, advance } = harness([
      failure,
      failure,
      failure,
    ]);
    const routine = await service.create({
      agentId: "coach",
      name: "Flaky",
      prompt: "Try",
      schedule: { kind: "interval", minutes: 60 },
      timeZone: "UTC",
    });

    await advance(60 * MINUTE);
    expect(service.get(routine.id)).toMatchObject({
      failureCount: 1,
      nextRunAt: "2026-11-05T10:15:00.000Z",
    });
    await advance(14 * MINUTE);
    expect(prompts).toHaveLength(1);
    await advance(MINUTE);
    expect(service.get(routine.id)?.nextRunAt).toBe("2026-11-05T10:45:00.000Z");
    await advance(30 * MINUTE);
    expect(service.get(routine.id)).toMatchObject({
      failureCount: 3,
      pausedReason: "failures",
    });
    expect(finished().map((run) => run.error)).toEqual([
      "boom",
      "boom",
      "boom",
    ]);

    await advance(24 * 60 * MINUTE);
    expect(prompts).toHaveLength(3);

    const resumed = service.update({ id: routine.id, paused: false });
    expect(resumed).toMatchObject({ pausedReason: null, failureCount: 0 });
    await advance(60 * MINUTE);
    expect(prompts).toHaveLength(4);
  });

  it("skips runs past the daily limit instead of calling the model", async () => {
    const { service, repository, prompts, advance } = harness();
    const routine = await service.create({
      agentId: "coach",
      name: "Busy",
      prompt: "Go",
      schedule: { kind: "interval", minutes: 5 },
      timeZone: "UTC",
    });
    for (let index = 0; index < 30; index += 1) await advance(5 * MINUTE);

    expect(prompts).toHaveLength(24);
    expect(
      repository
        .listRuns(routine.id, 100)
        .filter((run) => run.status === "skipped"),
    ).toHaveLength(6);
  });

  it("refuses an unknown persona, a bad schedule, and a bad time zone", async () => {
    const { service } = harness();
    const valid = {
      agentId: "coach",
      name: "Valid",
      prompt: "Go",
      schedule: { kind: "interval" as const, minutes: 60 },
      timeZone: "UTC",
    };
    await expect(
      service.create({ ...valid, agentId: "ghost" }),
    ).rejects.toThrow("ghost");
    await expect(
      service.create({ ...valid, schedule: { kind: "interval", minutes: 1 } }),
    ).rejects.toThrow("interval");
    await expect(
      service.create({ ...valid, timeZone: "Mars/Olympus" }),
    ).rejects.toThrow("time zone");
  });
});
