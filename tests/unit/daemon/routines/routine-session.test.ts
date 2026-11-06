import { createRoutineSessions } from "@cocurdex/daemon/internal/routines/routine-session";
import type { PersonalAgentRow } from "@cocurdex/db";
import type { RoutineRecord, SessionRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

const routine = {
  id: "routine",
  agentId: "coach",
  name: "Check in",
  prompt: "Check in",
  sessionId: "previous",
} as RoutineRecord;

function harness(timeoutMs: number) {
  const archived: string[] = [];
  const stopped: string[] = [];
  let created = 0;
  const sessions = createRoutineSessions({
    getPersona: () => ({ id: "coach", roleId: "role" }) as PersonalAgentRow,
    createSession: async () => {
      created += 1;
      return { id: `run-${created}` } as SessionRecord;
    },
    archiveSession: async (sessionId) => archived.push(sessionId),
    sendSessionMessage: async () => undefined,
    waitForSessionTurn: () => new Promise(() => {}),
    stopSessionTurn: async (sessionId) => stopped.push(sessionId),
    timeoutMs,
  });
  return { sessions, archived, stopped };
}

describe("routine sessions", () => {
  it("starts every run in a new thread and archives the previous one", async () => {
    const { sessions, archived } = harness(60_000);
    expect(await sessions.ensureSession(routine)).toBe("run-1");
    expect(archived).toEqual(["previous"]);
  });

  it("stops a run that outlives its time limit and fails it", async () => {
    const { sessions, stopped } = harness(10);
    const outcome = await sessions.runTurn(routine, "run-1");
    expect(outcome).toEqual({
      status: "failed",
      error: "The run hit its 1-minute limit and was stopped.",
    });
    expect(stopped).toEqual(["run-1"]);
  });
});
