import crypto from "node:crypto";
import type { PersonalAgentRow } from "@cocurdex/db";
import {
  type CreateSessionPayload,
  PERSONAL_WORKSPACE_ID,
  type RoutineRecord,
  type SendSessionCommand,
  type SessionRecord,
} from "@cocurdex/shared";
import type { SessionTurnOutcome } from "../session-control/execution-types";

export const ROUTINE_RUN_TIMEOUT_MS = 20 * 60_000;

export interface RoutineSessionDeps {
  getPersona(id: string): PersonalAgentRow | null;
  createSession(input: CreateSessionPayload): Promise<SessionRecord>;
  archiveSession(sessionId: string): Promise<unknown>;
  sendSessionMessage(command: SendSessionCommand): Promise<unknown>;
  waitForSessionTurn(sessionId: string): Promise<SessionTurnOutcome | null>;
  stopSessionTurn(sessionId: string): Promise<unknown>;
  timeoutMs?: number;
}

function timeoutMinutes(ms: number) {
  return Math.max(1, Math.round(ms / 60_000));
}

export function createRoutineSessions(deps: RoutineSessionDeps) {
  const timeoutMs = deps.timeoutMs ?? ROUTINE_RUN_TIMEOUT_MS;

  async function waitWithTimeout(sessionId: string) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), timeoutMs);
      timer.unref?.();
    });
    try {
      return await Promise.race([deps.waitForSessionTurn(sessionId), timedOut]);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async ensureSession(routine: RoutineRecord) {
      const persona = deps.getPersona(routine.agentId);
      if (!persona) {
        throw new Error(`Personal agent ${routine.agentId} was not found`);
      }
      const session = await deps.createSession({
        workspaceId: PERSONAL_WORKSPACE_ID,
        agentRoleId: persona.roleId,
        title: routine.name,
      });
      if (routine.sessionId) {
        await deps.archiveSession(routine.sessionId).catch(() => undefined);
      }
      return session.id;
    },

    async runTurn(
      routine: RoutineRecord,
      sessionId: string,
    ): Promise<SessionTurnOutcome> {
      await deps.sendSessionMessage({
        sessionId,
        messageId: crypto.randomUUID(),
        content: routine.prompt,
        delivery: "start-new-run",
        origin: {
          kind: "routine",
          routineId: routine.id,
          routineName: routine.name,
        },
      });
      const outcome = await waitWithTimeout(sessionId);
      if (outcome === "timeout") {
        await deps.stopSessionTurn(sessionId).catch(() => undefined);
        return {
          status: "failed",
          error: `The run hit its ${timeoutMinutes(timeoutMs)}-minute limit and was stopped.`,
        };
      }
      return outcome ?? { status: "failed", error: "The run did not finish." };
    },
  };
}
