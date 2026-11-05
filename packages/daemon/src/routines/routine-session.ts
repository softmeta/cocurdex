import crypto from "node:crypto";
import type { PersonalAgentRow } from "@cocurdex/db";
import {
  type AgentRoleRecord,
  type CreateSessionPayload,
  PERSONAL_WORKSPACE_ID,
  type RoutineRecord,
  type SendSessionCommand,
  type SessionConfiguration,
  type SessionRecord,
} from "@cocurdex/shared";
import type { SessionTurnOutcome } from "../session-control/execution-types";
import { routinePermissionMode } from "./routine-policy";

export interface RoutineSessionDeps {
  getPersona(id: string): PersonalAgentRow | null;
  getRole(id: string): Promise<AgentRoleRecord | null>;
  getSession(id: string): Promise<SessionRecord | null>;
  createSession(input: CreateSessionPayload): Promise<SessionRecord>;
  saveSessionConfiguration(input: SessionConfiguration): Promise<SessionRecord>;
  sendSessionMessage(command: SendSessionCommand): Promise<unknown>;
  waitForSessionTurn(sessionId: string): Promise<SessionTurnOutcome | null>;
}

export function createRoutineSessions(deps: RoutineSessionDeps) {
  async function reusable(routine: RoutineRecord) {
    if (!routine.sessionId) return null;
    const session = await deps.getSession(routine.sessionId);
    return session && !session.archivedAt ? session : null;
  }

  return {
    async ensureSession(routine: RoutineRecord) {
      const persona = deps.getPersona(routine.agentId);
      if (!persona) {
        throw new Error(`Personal agent ${routine.agentId} was not found`);
      }
      const role = await deps.getRole(persona.roleId);
      const session =
        (await reusable(routine)) ??
        (await deps.createSession({
          workspaceId: PERSONAL_WORKSPACE_ID,
          agentRoleId: persona.roleId,
          title: routine.name,
        }));
      const permissionMode = routinePermissionMode(
        routine.access,
        session.agentType,
        role?.permissionMode ?? undefined,
      );
      if (permissionMode !== session.permissionMode) {
        await deps.saveSessionConfiguration({ ...session, permissionMode });
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
      const outcome = await deps.waitForSessionTurn(sessionId);
      return outcome ?? { status: "failed", error: "The run did not finish." };
    },
  };
}
